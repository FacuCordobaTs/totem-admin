import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventMenuProductsResponse } from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
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

const tableHeaderClass = "text-[11px] font-normal lowercase text-white/45"

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
      <section className="max-w-md py-12" aria-label="Actividad del evento">
        <p className="text-[14px] text-red-400/80">{error ?? "Sin datos"}</p>
      </section>
    )
  }

  return (
    <section className="space-y-4" aria-labelledby="activity-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="activity-title" className="text-[15px] font-semibold text-white">
            Última actividad
          </h3>
          {supportsConsumptions && (
            <p className="mt-1 text-[13px] text-white/40">
              {int(lastHourSales.length)} venta{lastHourSales.length === 1 ? "" : "s"} en la última hora.
            </p>
          )}
        </div>
        {critical.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {critical.map((c) => (
              <span
                key={c.name}
                className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[12px] text-amber-200/90"
              >
                {c.name} · ~{int(c.servings)} {c.servings === 1 ? "trago" : "tragos"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
              <TableHead className={cn(tableHeaderClass, "w-[64px] pl-4")}>Hora</TableHead>
              <TableHead className={tableHeaderClass}>Detalle</TableHead>
              <TableHead className={cn(tableHeaderClass, "w-[108px] pr-4 text-right")}>Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
            {sales.length === 0 ? (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-[13px] text-white/35">
                  Todavía no hubo movimientos.
                </TableCell>
              </TableRow>
            ) : (
              sales.slice(0, 8).map((s) => (
                <TableRow key={s.id} className="border-0 hover:bg-white/[0.03]">
                  <TableCell className="py-3 pl-4 text-[13px] tabular-nums text-white/35">
                    {timeOfDay(s.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-0 py-3 text-[14px] text-white/65">
                    <p className="truncate" title={s.itemsSummary}>
                      {s.itemsSummary}
                    </p>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right text-[14px] tabular-nums text-white/70">
                    {money(s.totalAmount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
