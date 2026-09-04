import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse, EventMenuProductsResponse } from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import { Button } from "@/components/ui/button"
import { Loader2, SlidersHorizontal } from "lucide-react"
import {
  eventSupportsConsumptions,
  eventTracksStock,
} from "@/lib/event-operation-mode"
import type { EventOperationMode } from "@/types/events"

/**
 * Spec §5 "En vivo" — la app cambia de piel entera. El workspace se repliega y el evento se
 * vuelve panel de lectura, oscuro y en calma: 4-5 números grandes, un feed discreto de última
 * actividad, y acciones pocas y juntas ("Intervenir"). Ningún formulario de configuración es
 * accesible directamente: para tocar algo, el productor entra por "Intervenir" (vuelve al
 * workspace). Se lee solo, se refresca solo cada 20s.
 */

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
  eventName: string
  operationMode: EventOperationMode
  onIntervene: () => void
}

export function EventLivePanel({ eventId, eventName, operationMode, onIntervene }: Props) {
  const token = useAuthStore((s) => s.token)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [critical, setCritical] = useState<CriticalStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supportsConsumptions = eventSupportsConsumptions(operationMode)
  const tracksStock = eventTracksStock(operationMode)

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return
      if (!opts?.silent) setLoading(true)
      try {
        const [sum, salesRes, invRes, prodRes, menuRes] = await Promise.all([
          apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, { method: "GET", token }),
          apiFetch<SalesResponse>(`/events/${eventId}/sales?limit=30`, { method: "GET", token }),
          tracksStock
            ? apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token })
            : Promise.resolve({ items: [] } as EventInventoryListResponse),
          tracksStock
            ? apiFetch<ProductsApi>("/inventory/products", { method: "GET", token })
            : Promise.resolve({ products: [] } as ProductsApi),
          tracksStock
            ? apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token })
            : Promise.resolve({ products: [] } as EventMenuProductsResponse),
        ])
        setSummary(sum)
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
        setError(e instanceof ApiError ? e.message : "No se pudo cargar el panel")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [token, eventId, tracksStock]
  )

  useEffect(() => {
    void load()
    const t = setInterval(() => void load({ silent: true }), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const lastHourSales = useMemo(() => {
    const cutoff = Date.now() - LAST_HOUR_MS
    return sales.filter((s) => {
      const t = new Date(s.createdAt).getTime()
      return Number.isFinite(t) && t >= cutoff
    })
  }, [sales])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-[15px] text-red-400/80">{error ?? "Sin datos"}</p>
      </div>
    )
  }

  const inside = summary.ticketsCheckedIn
  const sold = summary.ticketsSold

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      {/* Cifra protagonista: recaudado total (entradas + barra) */}
      <div className="mb-12 text-center">
        <p className="text-[13px] uppercase tracking-[0.2em] text-white/30">{eventName} · en vivo</p>
        <p className="mt-4 text-6xl font-bold tabular-nums tracking-tight text-white sm:text-7xl">
          {money(summary.grossRevenue)}
        </p>
        <p className="mt-2 text-[14px] text-white/35">recaudado total</p>
      </div>

      {/* 3-4 números grandes en calma */}
      <div className={`grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02] ${supportsConsumptions ? "sm:grid-cols-3" : ""}`}>
        <BigStat label="gente adentro">
          <span className="tabular-nums text-white">{int(inside)}</span>
          <span className="text-2xl font-medium text-white/25"> / {int(sold)}</span>
        </BigStat>
        {supportsConsumptions ? <BigStat label="barra · última hora">
          <span className="tabular-nums text-white">{int(lastHourSales.length)}</span>
          <span className="text-2xl font-medium text-white/25"> ventas</span>
        </BigStat> : null}
        {supportsConsumptions ? <BigStat label="barra · total">
          <span className="tabular-nums text-white">{money(summary.barSalesRevenue)}</span>
        </BigStat> : null}
      </div>

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
      <div className="mt-12">
        <p className="mb-4 text-[12px] uppercase tracking-[0.18em] text-white/25">última actividad</p>
        {sales.length === 0 ? (
          <p className="text-[14px] text-white/30">Todavía no hubo movimientos.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {sales.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-2.5 text-[14px]">
                <span className="w-12 shrink-0 tabular-nums text-white/30">{timeOfDay(s.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-white/60">{s.itemsSummary}</span>
                <span className="shrink-0 tabular-nums text-white/45">{money(s.totalAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Intervenir: la única puerta a los formularios (spec: nada accesible directamente) */}
      <div className="mt-14 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          onClick={onIntervene}
          className="h-10 gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-5 text-[14px] font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/90"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Intervenir
        </Button>
      </div>
    </div>
  )
}

function BigStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/40 px-6 py-7">
      <p className="text-[12px] lowercase text-white/35">{label}</p>
      <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{children}</p>
    </div>
  )
}
