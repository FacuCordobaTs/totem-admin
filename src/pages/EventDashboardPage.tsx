import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { EventLayout } from "@/components/events/event-layout"
import {
  TicketTypeCreateDialog,
  TicketTypes,
} from "@/components/events/ticket-types"
import { CourtesiesPanel } from "@/components/events/courtesies-panel"
import {
  EventMessagesEntry,
  EventMessagesPanel,
} from "@/components/events/event-messages-panel"
import {
  AttendeeTable,
  type AttendeeTableHandle,
} from "@/components/events/attendee-table"
import { EventStaffTab } from "@/components/events/event-staff-tab"
import { EventTransportsTab } from "@/components/events/event-transports-tab"
import { EventBarSection } from "@/components/events/event-bar-section"
import { EventExpensesTab } from "@/components/events/event-expenses-tab"
import { EventIncomeSummary } from "@/components/events/event-income-summary"
import { EventSalesList } from "@/components/events/event-sales-list"
import { EventSummaryDashboard } from "@/components/events/event-summary-dashboard"
import { EventBalancePreview } from "@/components/events/event-balance-preview"
import { EventCashPeriod } from "@/components/events/event-cash-period"
import { EventClosedReport } from "@/components/events/event-closed-report"
import { EventFlyerMailPreview } from "@/components/events/event-flyer-mail-preview"
import { EventSalesConfig } from "@/components/events/event-sales-config"
import { AdmissionBlacklistPanel } from "@/components/events/admission-blacklist-panel"
import { MpConnectionCard } from "@/components/settings/mp-connection-card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"
import {
  eventOperationModeLabel,
  eventSupportsConsumptions,
  eventTracksStock,
} from "@/lib/event-operation-mode"
import {
  ExternalLink,
  ChevronLeft,
  Loader2,
  ArrowRight,
  Share2,
  Check,
  LayoutDashboard,
  Ticket,
  Bus,
  Wine,
  Users,
  Globe,
  TrendingUp,
  Ban,
  type LucideIcon,
} from "lucide-react"
import type { ApiEvent } from "@/types/events"

type SectionId =
  | "resumen"
  | "entradas"
  | "transporte"
  | "barra"
  | "equipo"
  | "acceso"
  | "pagina"
  | "finanzas"

const EVENT_SECTIONS: { id: SectionId; label: string; Icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", Icon: LayoutDashboard },
  { id: "pagina", label: "Página", Icon: Globe },
  { id: "entradas", label: "Entradas", Icon: Ticket },
  { id: "transporte", label: "Transporte", Icon: Bus },
  { id: "barra", label: "Barra", Icon: Wine },
  { id: "equipo", label: "Equipo", Icon: Users },
  { id: "acceso", label: "Acceso", Icon: Ban },
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

export function EventDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const tenantId = useAuthStore((s) => s.staff?.tenantId ?? null)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeSection, setActiveSection] = useState<SectionId>("resumen")
  const [financeView, setFinanceView] = useState<"summary" | "sales">("summary")
  // Entradas tiene una pantalla interna, "Mensajes" (recordatorio de WhatsApp), que reemplaza todo el
  // contenido de la sección hasta que se vuelve con el botón.
  const [ticketsView, setTicketsView] = useState<"main" | "messages">("main")
  const [refreshTick, setRefreshTick] = useState(0)
  // Las herramientas y los reportes se abren desde el mismo espacio de trabajo.
  const [view, setView] = useState<"workspace" | "balance" | "cash" | "report">("workspace")
  // Los reportes guardados conservan su contenido y enlace histórico.
  const [reportCopied, setReportCopied] = useState(false)

  // Entradas: hasta que exista al menos un tipo de entrada, el resto de la sección
  // (cortesías, tabla de asistentes) se oculta. null = todavía no sabemos (cargando).
  const [ticketTypeCount, setTicketTypeCount] = useState<number | null>(null)
  const hasTicketTypes = (ticketTypeCount ?? 0) > 0
  const [ticketTypeDialogOpen, setTicketTypeDialogOpen] = useState(false)

  // Tarea 3.1 — Restricción de edad (+18): toggle en la sección Entradas; persiste
  // `events.ageRestriction` (18 o null). Lo lee el escáner de DNI en la puerta.
  const [ageRestrictionBusy, setAgeRestrictionBusy] = useState(false)
  const [ageRestrictionError, setAgeRestrictionError] = useState<string | null>(null)

  const attendeeTableRef = useRef<AttendeeTableHandle>(null)
  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])
  const navigateToSection = useCallback((section: SectionId) => {
    setActiveSection(section)
    if (section === "finanzas") setFinanceView("summary")
    if (section === "entradas") setTicketsView("main")
  }, [])

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

  const operationMode = event.operationMode ?? "FULL_OPERATION"
  const supportsConsumptions = eventSupportsConsumptions(operationMode)
  const tracksStock = eventTracksStock(operationMode)
  const visibleSections = EVENT_SECTIONS.filter(
    (section) => supportsConsumptions || section.id !== "barra"
  )
  const subtitle = [formatEventDate(event.date), event.venue ?? event.location]
    .filter(Boolean)
    .join(" · ")

  function renderSection() {
    if (!event || !id) return null
    switch (activeSection) {
      case "resumen":
        return (
          <SectionShell
            title="Resumen"
            action={<MpConnectionCard tenantId={tenantId} token={token} variant="inline" />}
          >
            <EventSummaryDashboard
              eventId={id}
              operationMode={operationMode}
              refreshTrigger={refreshTick}
              hasUrl={Boolean(event.slug)}
              onNavigate={navigateToSection}
            />
          </SectionShell>
        )
      case "transporte":
        return <SectionShell title="Transporte"><EventTransportsTab eventId={id} /></SectionShell>
      case "entradas":
        if (ticketsView === "messages") {
          return (
            <SectionShell
              title="Mensajes"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTicketsView("main")}
                  className="cursor-pointer gap-1.5 border border-white/[0.10] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Volver a entradas
                </Button>
              }
            >
              <EventMessagesPanel
                event={event}
                onEnabledChange={(enabled) =>
                  setEvent((prev) =>
                    prev ? { ...prev, whatsappReminderEnabled: enabled } : prev
                  )
                }
              />
            </SectionShell>
          )
        }
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
            <TicketTypeCreateDialog
              eventDate={event.date}
              eventId={id}
              open={ticketTypeDialogOpen}
              onOpenChange={setTicketTypeDialogOpen}
              onCreated={bump}
            />
            <TicketTypes
              eventDate={event.date}
              eventId={id}
              refreshTrigger={refreshTick}
              onChanged={bump}
              onCountChange={setTicketTypeCount}
              onCreateTicketType={() => setTicketTypeDialogOpen(true)}
            />
            <AttendeeTable
              ref={attendeeTableRef}
              eventId={id}
              refreshTrigger={refreshTick}
              layout="canvas"
              hideExportButton
              allowSale={hasTicketTypes}
              onSaleCompleted={bump}
            />
            <CourtesiesPanel
              eventId={id}
              refreshTrigger={refreshTick}
              supportsConsumptions={supportsConsumptions}
              onChanged={bump}
            />
            <EventMessagesEntry
              enabled={event.whatsappReminderEnabled ?? false}
              onOpen={() => setTicketsView("messages")}
            />
          </SectionShell>
        )
      case "barra":
        return (
          <SectionShell title="Barra">
            <EventBarSection
              eventId={id}
              trackStock={tracksStock}
              onLogisticsChange={bump}
            />
          </SectionShell>
        )
      case "equipo":
        return (
          <SectionShell title="Equipo">
            <EventStaffTab
              eventId={id}
              eventLinkId={event.slug ?? id}
              promotersOnly={operationMode === "TICKETS_ONLY"}
              inviteAccessHint="El enlace inicia sesión directamente y sirve para volver a entrar, sin nombre ni PIN."
            />
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
          <SectionShell
            title="Página"
            action={
              event.slug ? (
                <a
                  href={`https://crow.ar/${event.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.08] hover:text-white active:opacity-70"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Visitar página
                </a>
              ) : undefined
            }
          >
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
            {financeView === "sales" ? (
              <EventSalesList eventId={id} supportsConsumptions={supportsConsumptions} onBack={() => setFinanceView("summary")} />
            ) : (
              <div className="space-y-10">
                <EventIncomeSummary eventId={id} refreshTrigger={refreshTick} supportsConsumptions={supportsConsumptions} onNavigate={navigateToSection} />
                <div className="flex items-center justify-between border-y border-white/[0.06] py-5">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Últimas ventas</h2>
                    <p className="mt-1 text-sm text-white/45">{supportsConsumptions ? "Consultá el detalle y filtrá entradas o consumos." : "Consultá el detalle de las entradas vendidas."}</p>
                  </div>
                  <Button variant="outline" onClick={() => setFinanceView("sales")} className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]">
                    Ver ventas
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                <EventExpensesTab eventId={id} embedded onExpensesChanged={bump} />
              </div>
            )}
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
              <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {event.name}
              </h1>
              <span className="rounded-full border border-[#FF9500]/20 bg-[#FF9500]/[0.06] px-3 py-1 text-[12px] font-semibold text-[#FFB340]">
                {eventOperationModeLabel(operationMode)}
              </span>
            </div>
            {subtitle && (
              <p className="mt-2 truncate text-[15px] text-zinc-500">{subtitle}</p>
            )}
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-3">
            {(role === "ADMIN" || role === "MANAGER") && view !== "cash" && (
              <Button type="button" variant="outline" onClick={() => setView("cash")}
                className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]">
                Caja por fechas
              </Button>
            )}
            {view !== "balance" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setView("balance")}
                className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]"
              >
                Balance del evento
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {event.closingReport && (
              <>
                <Button type="button" variant="outline" onClick={() => setView((current) => current === "report" ? "workspace" : "report")}
                className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]">
                {view === "report" ? "Volver al evento" : "Reporte guardado"}
              </Button>
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
              </>
            )}
          </div>
        </header>

        {/* Balance, caja y reportes conservan sus herramientas dentro del evento. */}
        {view === "cash" ? (
          <EventCashPeriod key={id} eventId={id} eventName={event.name} onBack={() => setView("workspace")} />
        ) : view === "balance" ? (
          <EventBalancePreview
            key={id}
            eventId={id}
            eventName={event.name}
            supportsConsumptions={supportsConsumptions}
            trackStock={tracksStock}
            onCancel={() => setView("workspace")}
          />
        ) : view === "report" && event.closingReport ? (
          <div className="space-y-6 pt-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Reporte guardado</h2>
              <p className="mt-2 text-sm text-zinc-400">Cifras guardadas el {formatEventDate(event.closingReport.closedAt)}.</p>
            </div>
            <EventClosedReport
              report={event.closingReport}
              eventName={event.name}
              eventDate={event.date}
              location={event.venue ?? event.location}
              showHeader={false}
            />
          </div>
        ) : (
        <div className="flex flex-col gap-8 pt-6 lg:flex-row lg:gap-10">
          {/* Nav lateral fija (spec §3.2 / §4): siempre visible, no colapsable */}
          <nav className="lg:sticky lg:top-20 lg:h-fit lg:w-44 lg:shrink-0">
            <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {visibleSections.map(({ id: sectionId, label, Icon }) => {
                const isActive = activeSection === sectionId
                return (
                  <button
                    key={sectionId}
                    type="button"
                    onClick={() => navigateToSection(sectionId)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors lg:w-full",
                      isActive
                        ? "bg-[#FF9500] text-black"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
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
            {renderSection()}
          </main>
        </div>
        )}
      </div>

    </EventLayout>
  )
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
