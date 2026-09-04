import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventSummaryResponse,
  EventMenuProductsResponse,
  EventPromoterSalesResponse,
  EventPromoterSalesRow,
} from "@/types/event-dashboard"
import type { ApiTicketType } from "@/components/events/ticket-types"
import { Lock, Loader2, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  eventSupportsConsumptions,
  eventTracksStock,
} from "@/lib/event-operation-mode"
import type { EventOperationMode } from "@/types/events"

/** Secciones del dashboard a las que el mapa de preparación puede saltar para corregir algo. */
export type PreparationTarget = "entradas" | "barra" | "pagina"

function formatMoney(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return "—"
  const isInt = Number.isInteger(n)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(n)
}

function formatInt(n: number): string {
  return n.toLocaleString("es-AR")
}

type EventStatus = "draft" | "active" | "finished"

type Props = {
  eventId: string
  status: EventStatus
  operationMode: EventOperationMode
  refreshTrigger?: number
  /** Si el evento ya tiene una URL (slug) pública configurada. */
  hasUrl?: boolean
  /** Salta a la sección del dashboard indicada (cambia el componente que se está mirando). */
  onNavigate?: (target: PreparationTarget) => void
}

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }
type EventInvRow = { stockAllocated: string }
type EventInventoryListResponse = { items: EventInvRow[] }

/**
 * Spec §4.1 / §5 — El Resumen es la única sección que cambia de naturaleza según el estado:
 *   - Borrador  → mapa de preparación (frases declarativas de qué falta, sin checklists ni %).
 *   - En venta  → pulso comercial (vendidas / recaudado, escalera de tandas, proyección vs equilibrio).
 *   - Cerrado   → reporte (grilla de métricas; la liquidación completa es 4.4/4.5).
 * (El estado "En vivo" lo cubre el panel de la noche, tarea 4.3 — no acá.)
 */
export function EventSummaryDashboard({ eventId, status, operationMode, refreshTrigger = 0, hasUrl, onNavigate }: Props) {
  const token = useAuthStore((s) => s.token)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)
  const [types, setTypes] = useState<ApiTicketType[] | null>(null)
  const [promoters, setPromoters] = useState<EventPromoterSalesRow[]>([])
  const [hasStock, setHasStock] = useState<boolean | null>(null)
  const [hasMenu, setHasMenu] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isDraft = status === "draft"
  const supportsConsumptions = eventSupportsConsumptions(operationMode)
  const tracksStock = eventTracksStock(operationMode)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [sum, tt] = await Promise.all([
        apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, { method: "GET", token }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, { method: "GET", token }),
      ])
      setSummary(sum)
      setTypes(tt.ticketTypes)

      // El mapa de preparación (borrador) necesita saber si la barra ya tiene stock y menú.
      if (isDraft) {
        const [inv, menu] = await Promise.all([
          tracksStock
            ? apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token })
            : Promise.resolve({ items: [] } as EventInventoryListResponse),
          supportsConsumptions
            ? apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token })
            : Promise.resolve({ products: [] } as EventMenuProductsResponse),
        ])
        setHasStock(tracksStock ? inv.items.some((i) => Number.parseFloat(i.stockAllocated) > 0) : null)
        setHasMenu(supportsConsumptions ? menu.products.some((p) => p.isActiveForEvent) : null)
        setPromoters([])
      } else {
        setHasStock(null)
        setHasMenu(null)
        // Tarea 9.2 — Reporte por promotor: cuánto vendió cada uno (entradas + barra).
        const pr = await apiFetch<EventPromoterSalesResponse>(`/events/${eventId}/promoter-sales`, { method: "GET", token })
        setPromoters(pr.promoters)
      }
    } catch (e) {
      setSummary(null)
      setTypes(null)
      setPromoters([])
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el resumen")
    } finally {
      setLoading(false)
    }
  }, [token, eventId, refreshTrigger, isDraft, supportsConsumptions, tracksStock])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" aria-hidden />
      </div>
    )
  }

  if (error || !summary || !types) {
    return (
      <p className="rounded-2xl border border-red-200/60 bg-red-50/80 px-5 py-4 text-[15px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        {error ?? "Sin datos"}
      </p>
    )
  }

  if (status === "draft") {
    return (
      <PreparationMap
        types={types}
        hasStock={hasStock}
        hasMenu={hasMenu}
        hasUrl={hasUrl}
        supportsConsumptions={supportsConsumptions}
        tracksStock={tracksStock}
        onNavigate={onNavigate}
      />
    )
  }

  if (status === "active") {
    return <CommercialPulse summary={summary} types={types} promoters={promoters} supportsConsumptions={supportsConsumptions} />
  }

  return <ReportGrid data={summary} promoters={promoters} supportsConsumptions={supportsConsumptions} />
}

/* ── Borrador: mapa de preparación (frases declarativas, sin checklists ni %) ────────── */

type PendingItem = {
  line: string
  cta: string
  target: PreparationTarget
}

function PreparationMap({
  types,
  hasStock,
  hasMenu,
  hasUrl,
  supportsConsumptions,
  tracksStock,
  onNavigate,
}: {
  types: ApiTicketType[]
  hasStock: boolean | null
  hasMenu: boolean | null
  hasUrl?: boolean
  supportsConsumptions: boolean
  tracksStock: boolean
  onNavigate?: (target: PreparationTarget) => void
}) {
  const pending: PendingItem[] = []
  if (types.length === 0)
    pending.push({ line: "Todavía no hay tipos de entrada.", cta: "Configurar entradas", target: "entradas" })
  if (supportsConsumptions && hasMenu === false)
    pending.push({ line: "El menú de la barra está vacío.", cta: "Configurar barra", target: "barra" })
  if (tracksStock && hasStock === false)
    pending.push({ line: "La barra no tiene stock inicial.", cta: "Cargar stock", target: "barra" })
  if (hasUrl === false)
    pending.push({ line: "Falta configurar la URL del evento.", cta: "Configurar URL", target: "pagina" })

  return (
    <div className="max-w-2xl space-y-4">
      {pending.length === 0 ? (
        <p className="text-[17px] leading-relaxed text-white/70">
          Está todo listo. Cuando quieras, abrí la venta.
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((item) => (
            <li
              key={item.line}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[16px] leading-relaxed text-white/70"
            >
              <span className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" aria-hidden />
                <span>{item.line}</span>
              </span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(item.target)}
                  className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-white/40 transition-colors hover:text-white/80"
                >
                  {item.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── En venta: pulso comercial ───────────────────────────────────────────────────────── */

type TierLine = { key: string; label: string }

/** Deriva la escalera de tandas de un tipo a partir de `sold` y los cupos por tramo. */
function tierLines(type: ApiTicketType): TierLine[] {
  const tiers = (type.tiers ?? []).slice().sort((a, b) => a.position - b.position)
  if (tiers.length === 0) {
    const label =
      type.stockLimit != null
        ? `${type.name} · ${formatInt(type.sold)}/${formatInt(type.stockLimit)}`
        : `${type.name} · ${formatInt(type.sold)}`
    return [{ key: type.id, label }]
  }
  let soldLeft = type.sold
  return tiers.map((tier) => {
    if (tier.stockLimit == null) {
      const label = `${tier.name} · ${formatInt(soldLeft)}`
      soldLeft = 0
      return { key: tier.id, label }
    }
    const consumed = Math.min(soldLeft, tier.stockLimit)
    soldLeft -= consumed
    const label =
      consumed >= tier.stockLimit
        ? `${tier.name} agotada`
        : `${tier.name} · ${formatInt(consumed)}/${formatInt(tier.stockLimit)}`
    return { key: tier.id, label }
  })
}

function CommercialPulse({
  summary,
  types,
  promoters,
  supportsConsumptions,
}: {
  summary: EventSummaryResponse
  types: ApiTicketType[]
  promoters: EventPromoterSalesRow[]
  supportsConsumptions: boolean
}) {
  const sold = summary.ticketsSold
  const cap = summary.ticketCapacity

  const projection = useMemo(() => {
    let potentialIncome = 0
    let totalCapacity = 0
    let priceSum = 0
    for (const t of types) {
      const price = Number.parseFloat(t.price)
      if (!Number.isNaN(price)) priceSum += price
      if (t.stockLimit != null && !Number.isNaN(price)) {
        potentialIncome += price * t.stockLimit
        totalCapacity += t.stockLimit
      }
    }
    const avgPrice =
      totalCapacity > 0
        ? potentialIncome / totalCapacity
        : types.length > 0
          ? priceSum / types.length
          : 0
    return { avgPrice }
  }, [types])

  const canViewCosts = summary.canViewFinancials
  const costs =
    canViewCosts && summary.totalExpenses != null
      ? Number.parseFloat(summary.totalExpenses)
      : null
  const breakEven =
    costs != null && costs > 0 && projection.avgPrice > 0
      ? Math.ceil(costs / projection.avgPrice)
      : null

  return (
    <div className="space-y-8">
      {/* Vendidas + recaudado, grandes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-white/[0.06] px-6 py-6">
          <p className="text-[13px] lowercase text-white/45">vendidas</p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">
            {formatInt(sold)}
            {cap != null && (
              <span className="text-2xl font-medium text-white/35"> / {formatInt(cap)}</span>
            )}
          </p>
        </article>
        <article className="rounded-2xl border border-white/[0.06] px-6 py-6">
          <p className="text-[13px] lowercase text-white/45">recaudado</p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">
            {formatMoney(summary.grossRevenue)}
          </p>
        </article>
      </div>

      {/* Escalera de tandas por tipo */}
      {types.length > 0 && (
        <div className="space-y-3">
          {types.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px]">
              {tierLines(t).map((tl, i) => (
                <span key={tl.key} className="flex items-center gap-2.5">
                  {i > 0 && <span className="text-white/20" aria-hidden>·</span>}
                  <span className="text-white/70">{tl.label}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tarea 9.2 — Ventas por promotor (visión §2.8). */}
      <PromoterSalesBlock rows={promoters} supportsConsumptions={supportsConsumptions} />

      {/* Proyección contra punto de equilibrio */}
      {canViewCosts && (
        <p className="border-t border-white/[0.06] pt-5 text-[15px] text-white/70">
          {costs == null || costs === 0 ? (
            "Todavía no cargaste costos."
          ) : breakEven != null ? (
            <>
              Vas{" "}
              <span className="font-semibold text-white">{formatInt(sold)}</span> de{" "}
              <span className="font-semibold text-white">~{breakEven}</span> entradas para cubrir costos.
            </>
          ) : (
            "Definí precios de entrada para calcular el punto de equilibrio."
          )}
        </p>
      )}
    </div>
  )
}

/* ── Cerrado: reporte (grilla de métricas) ───────────────────────────────────────────── */

function ReportGrid({
  data,
  promoters,
  supportsConsumptions,
}: {
  data: EventSummaryResponse
  promoters: EventPromoterSalesRow[]
  supportsConsumptions: boolean
}) {
  const sold = data.ticketsSold
  const checked = data.ticketsCheckedIn
  const cap = data.ticketCapacity
  const doorPct = sold > 0 ? Math.min(100, Math.round((checked / sold) * 1000) / 10) : 0

  const canjePct =
    data.digitalConsumptionsGenerated > 0
      ? Math.min(
          100,
          Math.round(
            (data.digitalConsumptionsRedeemed / data.digitalConsumptionsGenerated) * 1000
          ) / 10
        )
      : 0

  const netNum = data.netProfit != null ? Number.parseFloat(data.netProfit) : NaN
  const netPositive = !Number.isNaN(netNum) && netNum >= 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <MetricCard label="ingresos totales">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {formatMoney(data.grossRevenue)}
        </p>
      </MetricCard>

      <MetricCard label="gastos operativos">
        {data.canViewFinancials && data.totalExpenses != null ? (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {formatMoney(data.totalExpenses)}
          </p>
        ) : (
          <RestrictedValue />
        )}
      </MetricCard>

      <MetricCard label="resultado neto">
        {data.canViewFinancials && data.netProfit != null ? (
          <p
            className={cn(
              "text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
              netPositive ? "text-white" : "text-red-500"
            )}
          >
            {formatMoney(data.netProfit)}
          </p>
        ) : (
          <RestrictedValue />
        )}
      </MetricCard>

      <MetricCard label="entradas">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {cap != null ? (
            <>
              {formatInt(sold)}
              <span className="text-lg font-medium text-[#8E8E93] dark:text-[#98989D]">
                {" "}
                / {formatInt(cap)}
              </span>
            </>
          ) : (
            formatInt(sold)
          )}
        </p>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            <span>Puerta</span>
            <span className="tabular-nums">
              {formatInt(checked)} / {formatInt(sold)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/50 transition-[width] duration-500"
              style={{ width: `${doorPct}%` }}
              role="progressbar"
              aria-valuenow={doorPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </MetricCard>

      {supportsConsumptions ? <MetricCard label="bar & consumos">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {formatInt(data.digitalConsumptionsGenerated)}
        </p>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            <span>Canje</span>
            <span className="tabular-nums">
              {formatInt(data.digitalConsumptionsRedeemed)} /{" "}
              {formatInt(data.digitalConsumptionsGenerated)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/50 transition-[width] duration-500"
              style={{ width: `${canjePct}%` }}
              role="progressbar"
              aria-valuenow={canjePct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </MetricCard> : null}
      </div>

      {/* Tarea 9.2 — Ventas por promotor (visión §2.8). */}
      <PromoterSalesBlock rows={promoters} supportsConsumptions={supportsConsumptions} />
    </div>
  )
}

/* ── Tarea 9.2 — Ventas por promotor (se muestra en venta, en el resumen cerrado y en el
   reporte de cierre 10.3 — `event-closed-report.tsx` la importa con los datos congelados
   en `closingReport.byPromoter`, mismo shape que la API). ───────────────────────────────── */

export function PromoterSalesBlock({ rows, supportsConsumptions = true }: { rows: EventPromoterSalesRow[]; supportsConsumptions?: boolean }) {
  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-[13px] lowercase text-white/45">ventas por promotor</h3>
      <div className="space-y-1.5">
        {rows.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-foreground">
                {p.name}
                {!p.isActive ? (
                  <span className="ml-2 text-[12px] font-normal text-white/35">inactivo</span>
                ) : null}
              </p>
              <p className="text-[12px] text-white/40">
                {formatInt(p.ticketsCount)} entrada{p.ticketsCount === 1 ? "" : "s"}
                {supportsConsumptions ? (
                  <> · {formatInt(p.barItemsCount)} consumo{p.barItemsCount === 1 ? "" : "s"}</>
                ) : null}
              </p>
            </div>
            <p className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
              {formatMoney(p.totalRevenue)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl p-5">
      <p className="text-[12px] font-normal lowercase text-white/45">{label}</p>
      {children}
    </article>
  )
}

function RestrictedValue() {
  return (
    <div className="flex items-center gap-2 text-[15px] font-medium text-[#8E8E93] dark:text-[#98989D]">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      <span>Restringido</span>
    </div>
  )
}
