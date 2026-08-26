import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { EventLayout } from "@/components/events/event-layout"
import { TicketTypes } from "@/components/events/ticket-types"
import { CourtesiesPanel } from "@/components/events/courtesies-panel"
import {
  AttendeeTable,
  type AttendeeTableHandle,
} from "@/components/events/attendee-table"
import { EventOverviewTab } from "@/components/events/event-overview-tab"
import { EventStaffTab } from "@/components/events/event-staff-tab"
import { EventBarSection } from "@/components/events/event-bar-section"
import { EventExpensesTab } from "@/components/events/event-expenses-tab"
import { EventFinanceProjection } from "@/components/events/event-finance-projection"
import { EventSummaryDashboard } from "@/components/events/event-summary-dashboard"
import { EventLivePanel } from "@/components/events/event-live-panel"
import { EventClosingCeremony } from "@/components/events/event-closing-ceremony"
import { EventClosedReport } from "@/components/events/event-closed-report"
import { EventFlyerMailPreview } from "@/components/events/event-flyer-mail-preview"
import { EventSalesConfig } from "@/components/events/event-sales-config"
import { AdmissionBlacklistPanel } from "@/components/events/admission-blacklist-panel"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"
import { getEventShopUrl } from "@/lib/client-app-url"
import {
  ExternalLink,
  ChevronLeft,
  Loader2,
  ArrowRight,
  Radio,
  Share2,
  Check,
  LayoutDashboard,
  Ticket,
  Wine,
  Users,
  Globe,
  TrendingUp,
  Ban,
  type LucideIcon,
} from "lucide-react"
import type { ApiEvent } from "@/types/events"
import {
  eventStatusLabel,
  type EventStatus,
} from "@/lib/event-status"

type SectionId =
  | "resumen"
  | "entradas"
  | "barra"
  | "equipo"
  | "acceso"
  | "pagina"
  | "finanzas"

const EVENT_SECTIONS: { id: SectionId; label: string; Icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", Icon: LayoutDashboard },
  { id: "entradas", label: "Entradas", Icon: Ticket },
  { id: "barra", label: "Barra", Icon: Wine },
  { id: "equipo", label: "Equipo", Icon: Users },
  { id: "acceso", label: "Acceso", Icon: Ban },
  { id: "pagina", label: "Página", Icon: Globe },
  { id: "finanzas", label: "Finanzas", Icon: TrendingUp },
]

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

type SummaryStatus = "draft" | "active" | "finished"

/**
 * El Resumen (`EventSummaryDashboard`) todavía razona con 3 estados. Mapeamos la máquina real
 * de 4 estados: on_sale y live son ambos "pulso comercial" hasta que exista el panel En vivo (4.3).
 */
function summaryStatusOf(status: EventStatus): SummaryStatus {
  switch (status) {
    case "draft":
      return "draft"
    case "on_sale":
    case "live":
      return "active"
    case "closed":
      return "finished"
  }
}

type Readiness = { canOpenSale: boolean; missing: string[] }

export function EventDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeSection, setActiveSection] = useState<SectionId>("resumen")
  const [refreshTick, setRefreshTick] = useState(0)
  // En vivo (spec §5): la app cambia de piel al panel de la noche. "Intervenir" abre el
  // workspace por debajo del panel (única puerta a los formularios de config).
  const [intervening, setIntervening] = useState(false)
  // Ceremonia de cierre (spec §5 / 4.4): el único flujo por pasos. "Cerrar el evento" la abre;
  // reemplaza el panel/workspace mientras dura y termina transicionando el evento a closed.
  const [closing, setClosing] = useState(false)
  // Cerrado (spec §5 / 4.5): el reporte compartible por link. Copiado con confirmación efímera.
  const [reportCopied, setReportCopied] = useState(false)

  // Entradas: hasta que exista al menos un tipo de entrada, el resto de la sección
  // (cortesías, tabla de asistentes) se oculta. null = todavía no sabemos (cargando).
  const [ticketTypeCount, setTicketTypeCount] = useState<number | null>(null)
  const hasTicketTypes = (ticketTypeCount ?? 0) > 0

  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Tarea 3.1 — Restricción de edad (+18): toggle en la sección Entradas; persiste
  // `events.ageRestriction` (18 o null). Lo lee el escáner de DNI en la puerta.
  const [ageRestrictionBusy, setAgeRestrictionBusy] = useState(false)
  const [ageRestrictionError, setAgeRestrictionError] = useState<string | null>(null)

  const attendeeTableRef = useRef<AttendeeTableHandle>(null)
  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])

  const status: EventStatus = event?.status ?? "draft"

  const loadEvent = useCallback(async () => {
    if (!token || !id) return
    setLoadError(null)
    setLoading(true)
    try {
      const data = await apiFetch<{ event: ApiEvent }>(`/events/${id}`, {
        method: "GET",
        token,
      })
      setEvent(data.event)
    } catch (err) {
      setEvent(null)
      setLoadError(err instanceof ApiError ? err.message : "Evento no encontrado")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    void loadEvent()
  }, [loadEvent])

  // Readiness para "Abrir venta": solo importa en borrador. Se recalcula al cambiar tipos/cobro
  // (refreshTick lo bumpea la sección Entradas).
  useEffect(() => {
    if (!token || !id || status !== "draft") {
      setReadiness(null)
      return
    }
    let cancelled = false
    void apiFetch<Readiness>(`/events/${id}/readiness`, { method: "GET", token })
      .then((r) => {
        if (!cancelled) setReadiness(r)
      })
      .catch(() => {
        if (!cancelled) setReadiness(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, id, status, refreshTick])

  const transition = useCallback(
    async (to: EventStatus) => {
      if (!token || !id) return
      setTransitioning(true)
      setActionError(null)
      try {
        await apiFetch(`/events/${id}/transition`, {
          method: "POST",
          token,
          body: JSON.stringify({ to }),
        })
        await loadEvent()
        bump()
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "No se pudo cambiar el estado"
        )
      } finally {
        setTransitioning(false)
      }
    },
    [token, id, loadEvent, bump]
  )

  // Tarea 3.1 — Alterna la restricción de edad del evento (18 ⇄ null). La puerta la lee
  // desde el evento seleccionado: bloquea menores en el escaneo de DNI.
  const toggleAgeRestriction = useCallback(async () => {
    if (!token || !id || !event || ageRestrictionBusy) return
    setAgeRestrictionBusy(true)
    setAgeRestrictionError(null)
    const is18 = event.ageRestriction != null && event.ageRestriction > 0
    try {
      const data = await apiFetch<{ event: ApiEvent }>(`/events/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ ageRestriction: is18 ? null : 18 }),
      })
      setEvent(data.event)
    } catch (err) {
      setAgeRestrictionError(
        err instanceof ApiError ? err.message : "No se pudo actualizar el evento"
      )
    } finally {
      setAgeRestrictionBusy(false)
    }
  }, [token, id, event, ageRestrictionBusy])

  // Trigger automático de "En vivo" a la hora de puertas (spec §5): evaluación perezosa en
  // lectura. Si el evento está en venta y ya pasó `doorsAt`, avanza solo a live. El override
  // manual "Arrancar ahora" vive en el header. (Sin cron: se dispara al abrir/refrescar.)
  useEffect(() => {
    if (status !== "on_sale" || transitioning) return
    const doorsMs = event?.doorsAt ? new Date(event.doorsAt).getTime() : NaN
    if (Number.isFinite(doorsMs) && doorsMs <= Date.now()) {
      void transition("live")
    }
  }, [status, transitioning, event?.doorsAt, transition])

  if (!id) return <Navigate to="/eventos" replace />

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" />
        <p className="text-[15px] text-zinc-500">Cargando evento…</p>
      </div>
    )
  }

  if (loadError || !event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black">
        <p className="text-[17px] font-semibold text-red-400">
          {loadError ?? "No disponible"}
        </p>
        <Button asChild variant="ghost" className="text-[#FF9500]">
          <Link to="/eventos">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Volver a eventos
          </Link>
        </Button>
      </div>
    )
  }

  const summaryStatus = summaryStatusOf(status)
  const subtitle = [formatEventDate(event.date), event.location]
    .filter(Boolean)
    .join(" · ")

  function renderSection() {
    if (!event || !id) return null
    switch (activeSection) {
      case "resumen":
        return (
          <SectionShell title="Resumen">
            <EventSummaryDashboard
              eventId={id}
              status={summaryStatus}
              refreshTrigger={refreshTick}
              hasUrl={Boolean(event.slug)}
              onNavigate={setActiveSection}
            />
          </SectionShell>
        )
      case "entradas":
        return (
          <SectionShell
            title="Entradas"
            action={
              <div className="flex flex-col items-end gap-1 pb-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white/60">
                    Evento +18
                  </span>
                  <Switch
                    checked={event.ageRestriction != null && event.ageRestriction > 0}
                    onCheckedChange={() => void toggleAgeRestriction()}
                    disabled={ageRestrictionBusy}
                    aria-label="Evento +18"
                  />
                </div>
                {ageRestrictionError && (
                  <p className="text-[11px] text-red-400">{ageRestrictionError}</p>
                )}
              </div>
            }
          >
            <TicketTypes
              eventId={id}
              refreshTrigger={refreshTick}
              onChanged={bump}
              onCountChange={setTicketTypeCount}
            />
            {hasTicketTypes && (
              <>
                <CourtesiesPanel
                  eventId={id}
                  refreshTrigger={refreshTick}
                  onChanged={bump}
                />
                <AttendeeTable
                  ref={attendeeTableRef}
                  eventId={id}
                  refreshTrigger={refreshTick}
                  layout="canvas"
                  hideExportButton
                  onSaleCompleted={bump}
                />
              </>
            )}
          </SectionShell>
        )
      case "barra":
        return (
          <SectionShell
            title="Barra"
            action={
              <Button asChild variant="ghost" size="sm" className="cursor-pointer gap-1.5 border border-white/[0.10] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/75">
                <Link to={`/catalogo?from=${id}`}>
                  Gestionar catálogo global
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            <EventBarSection eventId={id} onLogisticsChange={bump} />
          </SectionShell>
        )
      case "equipo":
        return (
          <SectionShell title="Equipo">
            <EventStaffTab eventId={id} eventStatus={summaryStatus} />
          </SectionShell>
        )
      case "acceso":
        return (
          <SectionShell title="Acceso">
            <AdmissionBlacklistPanel
              eventId={id}
              refreshTrigger={refreshTick}
              onChanged={bump}
            />
          </SectionShell>
        )
      case "pagina":
        return (
          <SectionShell title="Página">
            {event.slug ? (
              <div className="grid gap-6 sm:grid-cols-[1fr_2fr]">
                <EventFlyerMailPreview event={event} onUpdated={loadEvent} />
                <EventSalesConfig event={event} onUpdated={loadEvent} />
              </div>
            ) : (
              <div className="max-w-xl">
                <EventSalesConfig event={event} onUpdated={loadEvent} onlySlug />
              </div>
            )}
          </SectionShell>
        )
      case "finanzas":
        return (
          <SectionShell title="Finanzas">
            <div className="space-y-10">
              <EventFinanceProjection eventId={id} refreshTrigger={refreshTick} />
              <EventOverviewTab eventId={id} refreshTrigger={refreshTick} />
              <EventExpensesTab eventId={id} embedded onExpensesChanged={bump} />
            </div>
          </SectionShell>
        )
    }
  }

  return (
    <EventLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        {/* Header permanente del evento (spec §4) */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {event.name}
              </h1>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-[12px] font-semibold text-white/60">
                {eventStatusLabel(status)}
              </span>
            </div>
            {subtitle && (
              <p className="mt-2 truncate text-[15px] text-zinc-500">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <PrimaryStateAction
              status={status}
              readiness={readiness}
              busy={transitioning}
              error={actionError}
              onTransition={transition}
              onStartClosing={() => setClosing(true)}
            />
            {status === "closed" && event.closingReport && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`${window.location.origin}/r/${event.id}`)
                    .then(() => {
                      setReportCopied(true)
                      window.setTimeout(() => setReportCopied(false), 2000)
                    })
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.08] active:opacity-70"
              >
                {reportCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {reportCopied ? "Link copiado" : "Compartir reporte"}
              </button>
            )}
            <a
              href={getEventShopUrl(event.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.08] active:opacity-70"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Visitar página</span>
            </a>
          </div>
        </header>

        {/* Cierre: la ceremonia por pasos toma toda la pantalla mientras dura (spec §5 / 4.4). */}
        {closing ? (
          <EventClosingCeremony
            eventId={id}
            eventName={event.name}
            onClosed={() => {
              setClosing(false)
              void loadEvent()
              bump()
            }}
            onCancel={() => setClosing(false)}
          />
        ) : /* Cerrado: solo lectura, el reporte de liquidación como cara visible (spec §5 / 4.5).
            Reemplaza el workspace. Los eventos cerrados sin liquidación congelada (legacy, sin
            ceremonia) caen al workspace normal con el Resumen "finished". */
        status === "closed" && event.closingReport ? (
          <div className="pt-8">
            <EventClosedReport
              report={event.closingReport}
              eventName={event.name}
              eventDate={event.date}
              location={event.location}
              showHeader={false}
            />
          </div>
        ) : /* En vivo: la app cambia de piel. El workspace se repliega y el evento se vuelve
            panel de lectura (spec §5). "Intervenir" reabre el workspace por debajo. */
        status === "live" && !intervening ? (
          <EventLivePanel
            eventId={id}
            eventName={event.name}
            onIntervene={() => setIntervening(true)}
          />
        ) : (
        <div className="flex flex-col gap-8 pt-6 lg:flex-row lg:gap-10">
          {/* Nav lateral fija (spec §3.2 / §4): siempre visible, no colapsable */}
          <nav className="lg:sticky lg:top-20 lg:h-fit lg:w-44 lg:shrink-0">
            <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {EVENT_SECTIONS.map(({ id: sectionId, label, Icon }) => {
                const isActive = activeSection === sectionId
                return (
                  <button
                    key={sectionId}
                    type="button"
                    onClick={() => setActiveSection(sectionId)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors lg:w-full",
                      isActive
                        ? "bg-[#FF9500] text-white"
                        : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Una sola sección editable a la vez */}
          <main className="min-w-0 flex-1 pb-32">
            {status === "live" && intervening && (
              <button
                type="button"
                onClick={() => setIntervening(false)}
                className="mb-6 flex items-center gap-2 rounded-full border border-[#FF9500]/30 bg-[#FF9500]/[0.08] px-4 py-1.5 text-[13px] font-medium text-[#FF9500] transition-colors hover:bg-[#FF9500]/[0.14]"
              >
                <Radio className="h-3.5 w-3.5" />
                Estás en vivo · volver al panel
              </button>
            )}
            {renderSection()}
          </main>
        </div>
        )}
      </div>

    </EventLayout>
  )
}

/**
 * Acción primaria contextual del header (spec §4 / §5). El productor solo empuja dos
 * transiciones: "Abrir venta" (borrador) y "Cerrar el evento" (en venta / en vivo).
 * En borrador, si falta algo esencial el botón va atenuado y al lado —en una sola línea, sin
 * modal ni lista— dice exactamente qué falta.
 */
function PrimaryStateAction({
  status,
  readiness,
  busy,
  error,
  onTransition,
  onStartClosing,
}: {
  status: EventStatus
  readiness: Readiness | null
  busy: boolean
  error: string | null
  onTransition: (to: EventStatus) => void
  onStartClosing: () => void
}) {
  if (status === "draft") {
    const blocked = readiness != null && !readiness.canOpenSale
    const reason =
      blocked && readiness.missing.length > 0
        ? `Falta ${readiness.missing.join(" y ")}`
        : error
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {reason && (
          <span className="order-2 text-[13px] text-white/40 sm:order-1">
            {reason}
          </span>
        )}
        <Button
          type="button"
          disabled={blocked || busy}
          onClick={() => onTransition("on_sale")}
          className="order-1 h-9 gap-2 bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40 sm:order-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir venta
        </Button>
      </div>
    )
  }

  // En venta: la única acción manual es arrancar la noche (override de lo automático a la hora
  // de puertas). Cerrar el evento se hace desde En vivo.
  if (status === "on_sale") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {error && (
          <span className="order-2 text-[13px] text-red-400/80 sm:order-1">
            {error}
          </span>
        )}
        <Button
          type="button"
          disabled={busy}
          onClick={() => onTransition("live")}
          className="order-1 h-9 gap-2 bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40 sm:order-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Arrancar ahora
        </Button>
      </div>
    )
  }

  if (status === "live") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {error && (
          <span className="order-2 text-[13px] text-red-400/80 sm:order-1">
            {error}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onStartClosing}
          className="order-1 h-9 gap-2 border border-white/[0.15] bg-white/[0.05] px-4 text-[14px] font-semibold text-white/80 hover:bg-white/[0.10] sm:order-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Cerrar el evento
        </Button>
      </div>
    )
  }

  return null
}

function SectionShell({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
