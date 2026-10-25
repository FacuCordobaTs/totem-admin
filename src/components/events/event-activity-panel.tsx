import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventMenuProductsResponse } from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import { Loader2 } from "lucide-react"
import {
  eventSupportsConsumptions,
  eventTracksStock,
} from "@/lib/event-operation-mode"
import type { EventOperationMode } from "@/types/events"

const POLL_MS = 20_000
const LAST_HOUR_MS = 60 * 60 * 1000

function money(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function int(n: number): string {
  return n.toLocaleString("es-AR")
}

function timeOfDay(iso: string | Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

type EventInvRow = {
  id: string
  name: string
  baseUnit: ApiProduct["recipes"][number]["inventoryBaseUnit"]
  packageSize: string
  stockAllocated: string
}
type EventInventoryListResponse = { items: EventInvRow[] }
type ProductsApi = { products: ApiProduct[] }

type SaleRow = {
  id: string
  createdAt: string
  source: string
  totalAmount: string
  itemsSummary: string
  staffName: string | null
}
type SalesResponse = { sales: SaleRow[] }

/**
 * Consumo por venta de un producto para una línea de receta. Mismo criterio que
 * `event-bar-section.tsx` (`perSaleBaseUnits`): un BOTTLE declara la receta en envases y el
 * stock vive en base units (ml/g), por eso multiplica por el tamaño de envase.
 */
function perSaleBaseUnits(product: ApiProduct, line: ApiProduct["recipes"][number]): number {
  let qty = Number.parseFloat(line.quantityUsed)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  if (
    product.saleType === "BOTTLE" &&
    (line.inventoryBaseUnit === "ML" || line.inventoryBaseUnit === "GRAMS")
  ) {
    const pkg = Number.parseFloat(line.inventoryPackageSize ?? "0")
    if (Number.isFinite(pkg) && pkg > 0) qty = qty * pkg
  }
  return qty
}

/** "alcanza para ~N tragos" de un insumo, según el primer GLASS activo que lo consume. */
function insumoServings(insumo: EventInvRow, activeGlassProducts: ApiProduct[]): number | null {
  const stock = Number.parseFloat(insumo.stockAllocated)
  if (!Number.isFinite(stock) || stock <= 0) return null
  for (const p of activeGlassProducts) {
    const line = p.recipes.find((r) => r.inventoryItemId === insumo.id)
    if (!line) continue
    const per = perSaleBaseUnits(p, line)
    if (per <= 0) continue
    return Math.max(0, Math.floor(stock / per))
  }
  return null
}

type CriticalStock = { name: string; servings: number }

type Props = {
  eventId: string
  operationMode: EventOperationMode
  refreshTrigger?: number
}

export function EventActivityPanel({ eventId, operationMode, refreshTrigger = 0 }: Props) {
  const token = useAuthStore((s) => s.token)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [critical, setCritical] = useState<CriticalStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supportsConsumptions = eventSupportsConsumptions(operationMode)
  const tracksStock = eventTracksStock(operationMode)

  const load = useCallback(
    async (signal: AbortSignal, silent = false) => {
      if (!token) return
      if (!silent) setLoading(true)
      try {
        const [salesRes, invRes, prodRes, menuRes] = await Promise.all([
          apiFetch<SalesResponse>(`/events/${eventId}/sales?limit=30`, { method: "GET", token, signal }),
          tracksStock
            ? apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token, signal })
            : Promise.resolve({ items: [] } as EventInventoryListResponse),
          tracksStock
            ? apiFetch<ProductsApi>("/inventory/products", { method: "GET", token, signal })
            : Promise.resolve({ products: [] } as ProductsApi),
          tracksStock
            ? apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token, signal })
            : Promise.resolve({ products: [] } as EventMenuProductsResponse),
        ])
        if (signal.aborted) return
        setSales(salesRes.sales)

        // Stock crítico: solo insumos que rinden pocos tragos (≤ 12) — "solo si existe".
        const activeGlass = prodRes.products.filter(
          (p) =>
            (p.saleType ?? "GLASS") === "GLASS" &&
            p.recipes.length > 0 &&
            menuRes.products.some((m) => m.id === p.id && m.isActiveForEvent)
        )
        const low: CriticalStock[] = []
        for (const insumo of invRes.items) {
          const servings = insumoServings(insumo, activeGlass)
          if (servings != null && servings <= 12) {
            low.push({ name: insumo.name, servings })
          }
        }
        low.sort((a, b) => a.servings - b.servings)
        setCritical(low)
        setError(null)
      } catch (e) {
        if (!signal.aborted) setError(e instanceof ApiError ? e.message : "No se pudo cargar la actividad")
      } finally {
        if (!signal.aborted && !silent) setLoading(false)
      }
    },
    [token, eventId, tracksStock]
  )

  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const refresh = async (silent = false) => {
      if (busy) return
      busy = true
      try { await load(controller.signal, silent) } finally { busy = false }
    }
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(true) }, POLL_MS)
    return () => { controller.abort(); clearInterval(timer) }
  }, [load, refreshTrigger])

  const lastHourSales = useMemo(() => {
    const cutoff = Date.now() - LAST_HOUR_MS
    return sales.filter((s) => {
      const t = new Date(s.createdAt).getTime()
      return Number.isFinite(t) && t >= cutoff
    })
  }, [sales])

  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-[15px] text-red-400/80">{error ?? "Sin datos"}</p>
      </div>
    )
  }

  return (
    <section className="space-y-6 border-t border-white/10 pt-6" aria-label="Actividad del evento">
      {/* Stock crítico — solo si existe */}
      {critical.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {critical.map((c) => (
            <span
              key={c.name}
              className="rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-1.5 text-[13px] text-amber-200/80"
            >
              {c.name}: ~{int(c.servings)} {c.servings === 1 ? "trago" : "tragos"}
            </span>
          ))}
        </div>
      )}

      {/* Feed discreto de última actividad */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Última actividad</h3>
        {supportsConsumptions && <p className="mb-4 text-sm text-zinc-400">{int(lastHourSales.length)} ventas recientes en la última hora.</p>}
        {sales.length === 0 ? (
          <p className="text-[14px] text-zinc-400">Todavía no hubo movimientos.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {sales.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-2.5 text-[14px]">
                <span className="w-12 shrink-0 tabular-nums text-zinc-400">{timeOfDay(s.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-white/60">{s.itemsSummary}</span>
                <span className="shrink-0 tabular-nums text-zinc-400">{money(s.totalAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

    </section>
  )
}
