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
import { EventActivityPanel } from "./event-activity-panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowRight, ChevronDown, Lock, Loader2 } from "lucide-react"
import Decimal from "decimal.js"
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

const tableHeaderClass = "text-[11px] font-normal lowercase text-white/45"

type Props = {
  eventId: string
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

/** Configuración pendiente y métricas actuales, disponibles para todos los eventos. */
export function EventSummaryDashboard({ eventId, operationMode, refreshTrigger = 0, hasUrl, onNavigate }: Props) {
  const token = useAuthStore((s) => s.token)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)
  const [types, setTypes] = useState<ApiTicketType[] | null>(null)
  const [promoters, setPromoters] = useState<EventPromoterSalesRow[]>([])
  const [hasStock, setHasStock] = useState<boolean | null>(null)
  const [hasMenu, setHasMenu] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supportsConsumptions = eventSupportsConsumptions(operationMode)
  const tracksStock = eventTracksStock(operationMode)

  const load = useCallback(async (signal: AbortSignal, silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    try {
      const options = { method: "GET", token, signal }
      const [sum, tt, inv, menu, pr] = await Promise.all([
        apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, options),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, options),
        tracksStock
          ? apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, options)
          : Promise.resolve({ items: [] } as EventInventoryListResponse),
        supportsConsumptions
          ? apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, options)
          : Promise.resolve({ products: [] } as EventMenuProductsResponse),
        apiFetch<EventPromoterSalesResponse>(`/events/${eventId}/promoter-sales`, options),
      ])
      if (signal.aborted) return
      setSummary(sum)
      setTypes(tt.ticketTypes)
      setHasStock(tracksStock ? inv.items.some((i) => Number.parseFloat(i.stockAllocated) > 0) : null)
      setHasMenu(supportsConsumptions ? menu.products.some((p) => p.isActiveForEvent) : null)
      setPromoters(pr.promoters)
      setError(null)
    } catch (e) {
      if (!signal.aborted) setError(e instanceof ApiError ? e.message : "No se pudo cargar el resumen")
    } finally {
      if (!signal.aborted && !silent) setLoading(false)
    }
  }, [token, eventId, supportsConsumptions, tracksStock])

  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const refresh = async (silent = false) => {
      if (busy) return
      busy = true
      try { await load(controller.signal, silent) } finally { busy = false }
    }
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(true) }, 20_000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [load, refreshTrigger])

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" aria-hidden />
      </div>
    )
  }

  if (!summary || !types) {
    return (
      <p className="rounded-2xl bg-red-500/10 px-5 py-4 text-[14px] text-red-300">
        {error ?? "Sin datos"}
      </p>
    )
  }

  return (
    <div className="space-y-12">
      {error && (
        <p role="status" className="text-[13px] text-amber-300/90">
          {error}. Se muestran los últimos datos disponibles.
        </p>
      )}
      <PreparationMap
        types={types}
        hasStock={hasStock}
        hasMenu={hasMenu}
        hasUrl={hasUrl}
        supportsConsumptions={supportsConsumptions}
        tracksStock={tracksStock}
        onNavigate={onNavigate}
      />
      <ReportGrid
        data={summary}
        types={types}
        promoters={promoters}
        supportsConsumptions={supportsConsumptions}
      />
      <EventActivityPanel eventId={eventId} operationMode={operationMode} refreshTrigger={refreshTrigger} />
      <p className="text-[12px] text-white/25">Actualización automática cada 20 segundos.</p>
    </div>
  )
}

/* Configuración pendiente */

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

  if (pending.length === 0) return null

  return (
    <section className="max-w-2xl space-y-3" aria-labelledby="preparation-title">
      <h3 id="preparation-title" className="text-[15px] font-semibold text-white">
        Falta configurar
      </h3>
      <ul className="space-y-2.5">
        {pending.map((item) => (
          <li
            key={item.line}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[14px] leading-relaxed text-white/60"
          >
            <span className="flex items-start gap-3">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" aria-hidden />
              <span>{item.line}</span>
            </span>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(item.target)}
                className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-white/45 transition-colors hover:text-white"
              >
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* Métricas y ventas */

function ReportGrid({
  data,
  types,
  promoters,
  supportsConsumptions,
}: {
  data: EventSummaryResponse
  types: ApiTicketType[]
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
    <div className="space-y-12">
      <section aria-labelledby="metrics-title" className="space-y-6">
        <h3 id="metrics-title" className="text-[15px] font-semibold text-white">
          Números del evento
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-8 xl:grid-cols-3">
          <Metric
            className="col-span-2 sm:col-span-1"
            label="ingresos totales"
            value={formatMoney(data.grossRevenue)}
            detail={
              supportsConsumptions
                ? `Entradas ${formatMoney(data.ticketRevenue)} · Consumos ${formatMoney(data.barSalesRevenue)}`
                : `Entradas ${formatMoney(data.ticketRevenue)}`
            }
          />

          <Metric
            label="gastos operativos"
            value={
              data.canViewFinancials && data.totalExpenses != null ? (
                formatMoney(data.totalExpenses)
              ) : (
                <RestrictedValue />
              )
            }
            detail={data.canViewFinancials ? "Costos del evento" : undefined}
          />

          <Metric
            label="resultado neto"
            value={
              data.canViewFinancials && data.netProfit != null ? (
                <span className={netPositive ? undefined : "text-red-400"}>
                  {formatMoney(data.netProfit)}
                </span>
              ) : (
                <RestrictedValue />
              )
            }
            detail={data.canViewFinancials ? "Ingresos menos gastos" : undefined}
          />

          <Metric
            label="entradas"
            value={
              cap != null ? (
                <>
                  {formatInt(sold)}
                  <span className="text-[16px] font-medium text-white/35"> / {formatInt(cap)}</span>
                </>
              ) : (
                formatInt(sold)
              )
            }
            detail={`Puerta ${formatInt(checked)} de ${formatInt(sold)}`}
          >
            <ProgressBar value={doorPct} label="Entradas registradas en puerta" />
          </Metric>

          {supportsConsumptions ? (
            <Metric
              label="bar & consumos"
              value={formatInt(data.digitalConsumptionsGenerated)}
              detail={`Canje ${formatInt(data.digitalConsumptionsRedeemed)} de ${formatInt(data.digitalConsumptionsGenerated)}`}
            >
              <ProgressBar value={canjePct} label="Consumos canjeados" />
            </Metric>
          ) : null}
        </div>
      </section>

      <TicketTypesBlock types={types} summary={data} />

      {/* Tarea 9.2 — Ventas por promotor (visión §2.8). El listado arranca con 5 filas para
          que costos y actividad no queden lejos; "Ver todos" despliega el resto. */}
      <PromoterSalesBlock
        rows={promoters}
        supportsConsumptions={supportsConsumptions}
        limit={5}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  detail,
  children,
  className,
}: {
  label: string
  value: React.ReactNode
  detail?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[12px] font-normal lowercase text-white/40">{label}</p>
      <p className="mt-2 text-[22px] font-semibold leading-none tabular-nums tracking-tight text-white sm:text-[30px]">
        {value}
      </p>
      {detail && <p className="mt-2 text-[12px] leading-relaxed text-white/35">{detail}</p>}
      {children}
    </div>
  )
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-3 h-1 max-w-[220px] overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-white/45 transition-[width] duration-500"
        style={{ width: `${value}%` }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

function RestrictedValue() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-medium text-white/35">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      Restringido
    </span>
  )
}

/* Entradas por tipo + punto de equilibrio */

function TicketTypesBlock({
  types,
  summary,
}: {
  types: ApiTicketType[]
  summary: EventSummaryResponse
}) {
  const sold = summary.ticketsSold

  const breakEven = useMemo(() => {
    if (!summary.canViewFinancials || summary.totalExpenses == null) return null
    const costs = new Decimal(summary.totalExpenses)
    if (!costs.isFinite() || costs.lte(0)) return null

    let potentialIncome = new Decimal(0)
    let totalCapacity = 0
    let priceSum = new Decimal(0)
    for (const t of types) {
      const price = new Decimal(t.price)
      if (price.isFinite()) priceSum = priceSum.plus(price)
      if (t.stockLimit != null && price.isFinite()) {
        potentialIncome = potentialIncome.plus(price.times(t.stockLimit))
        totalCapacity += t.stockLimit
      }
    }
    const avgPrice =
      totalCapacity > 0
        ? potentialIncome.div(totalCapacity)
        : types.length > 0
          ? priceSum.div(types.length)
          : new Decimal(0)
    return avgPrice.gt(0) ? costs.div(avgPrice).ceil().toNumber() : null
  }, [summary.canViewFinancials, summary.totalExpenses, types])

  const breakEvenPct =
    breakEven != null && breakEven > 0 ? Math.min(100, Math.round((sold / breakEven) * 1000) / 10) : 0

  return (
    <section aria-labelledby="ticket-types-title" className="space-y-3">
      <h3 id="ticket-types-title" className="text-[15px] font-semibold text-white">
        Entradas por tipo
      </h3>

      {types.length === 0 ? (
        <p className="text-[13px] text-white/40">Todavía no hay tipos de entrada.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className={cn(tableHeaderClass, "pl-4")}>Tipo</TableHead>
                <TableHead className={cn(tableHeaderClass, "w-[104px] text-right")}>Vendidas</TableHead>
                <TableHead className={cn(tableHeaderClass, "w-[112px] pr-4 text-right")}>Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {types.map((t) => (
                <TableRow key={t.id} className="border-0 hover:bg-white/[0.03]">
                  <TableCell className="max-w-0 py-3.5 pl-4">
                    <p className="truncate text-[15px] font-medium text-foreground" title={t.name}>
                      {t.name}
                      {t.isActive === false && (
                        <span className="font-normal text-white/30"> · inactiva</span>
                      )}
                    </p>
                  </TableCell>
                  <TableCell className="py-3.5 text-right text-[14px] tabular-nums text-white/70">
                    {formatInt(t.sold)}
                    {t.stockLimit != null && (
                      <span className="text-white/30"> / {formatInt(t.stockLimit)}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 pr-4 text-right text-[14px] tabular-nums text-white/50">
                    {formatMoney(t.price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {summary.canViewFinancials && (
        <div className="space-y-2">
          <p className="text-[13px] text-white/45">
            {summary.totalExpenses == null || Number.parseFloat(summary.totalExpenses) === 0 ? (
              "Todavía no cargaste costos."
            ) : breakEven != null ? (
              <>
                Vas <span className="font-semibold text-white/80">{formatInt(sold)}</span> de{" "}
                <span className="font-semibold text-white/80">~{formatInt(breakEven)}</span> entradas
                para cubrir costos.
              </>
            ) : (
              "Definí precios de entrada para calcular el punto de equilibrio."
            )}
          </p>
          {breakEven != null && (
            <div className="h-1 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white/45 transition-[width] duration-500"
                style={{ width: `${breakEvenPct}%` }}
                role="progressbar"
                aria-label="Avance hacia el punto de equilibrio"
                aria-valuenow={breakEvenPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ── Tarea 9.2 — Ventas por promotor (se muestra en venta, en el resumen cerrado y en el
   reporte de cierre 10.3 — `event-closed-report.tsx` la importa con los datos congelados
   en `closingReport.byPromoter`, mismo shape que la API). Con `limit`, el listado arranca
   recortado y se despliega con "Ver todos". ─────────────────────────────────────────────── */

export function PromoterSalesBlock({
  rows,
  supportsConsumptions = true,
  limit,
}: {
  rows: EventPromoterSalesRow[]
  supportsConsumptions?: boolean
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)

  if (rows.length === 0) return null

  const canCollapse = limit != null && rows.length > limit
  const visible = canCollapse && !expanded ? rows.slice(0, limit) : rows
  const hiddenCount = rows.length - visible.length

  return (
    <section aria-labelledby="promoters-title" className="space-y-3">
      <h3 id="promoters-title" className="text-[15px] font-semibold text-white">
        Ventas por promotor
      </h3>

      <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
              <TableHead className={cn(tableHeaderClass, "pl-4")}>Promotor</TableHead>
              <TableHead className={cn(tableHeaderClass, "w-[88px] text-right")}>Entradas</TableHead>
              {supportsConsumptions && (
                <TableHead className={cn(tableHeaderClass, "hidden w-[92px] text-right sm:table-cell")}>
                  Consumos
                </TableHead>
              )}
              <TableHead className={cn(tableHeaderClass, "w-[112px] pr-4 text-right")}>Ingresos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
            {visible.map((p) => (
              <TableRow key={p.id} className="border-0 hover:bg-white/[0.03]">
                <TableCell className="max-w-0 py-3.5 pl-4">
                  <p
                    className="truncate text-[15px] font-medium text-foreground"
                    title={`${p.name}${!p.isActive ? " · inactivo" : ""}${p.generalPromoterName ? ` · Promotor general: ${p.generalPromoterName}` : ""}`}
                  >
                    {p.name}
                    {!p.isActive && <span className="font-normal text-white/30"> · inactivo</span>}
                    {p.generalPromoterName && (
                      <span className="font-normal text-white/30"> · {p.generalPromoterName}</span>
                    )}
                  </p>
                </TableCell>
                <TableCell className="py-3.5 text-right text-[14px] tabular-nums text-white/70">
                  {formatInt(p.ticketsCount)}
                </TableCell>
                {supportsConsumptions && (
                  <TableCell className="hidden py-3.5 text-right text-[14px] tabular-nums text-white/45 sm:table-cell">
                    {formatInt(p.barItemsCount)}
                  </TableCell>
                )}
                <TableCell className="py-3.5 pr-4 text-right text-[14px] font-semibold tabular-nums text-white/80">
                  {formatMoney(p.totalRevenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF9500] focus-visible:outline-offset-2"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      )}

      {!expanded && hiddenCount > 0 && (
        <span className="sr-only">{hiddenCount} promotores más</span>
      )}
    </section>
  )
}
