import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { EventLayout } from "@/components/events/event-layout"
import { useEventNestedActive } from "@/components/events/event-mobile-nav"
import { TicketTypes } from "@/components/events/ticket-types"
import { CourtesiesPanel } from "@/components/events/courtesies-panel"
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
  ChevronRight,
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

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeSection, setActiveSection] = useState<SectionId>("resumen")
  // En mobile la página funciona por pasos: primero el índice de secciones y después
  // una sola sección ocupando todo el espacio. En desktop se ignora.
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false)
  const [financeView, setFinanceView] = useState<"summary" | "sales">("summary")
  const [refreshTick, setRefreshTick] = useState(0)
  // Las herramientas y los reportes se abren desde el mismo espacio de trabajo.
  const [view, setView] = useState<"workspace" | "balance" | "cash" | "report">("workspace")
  // Los reportes guardados conservan su contenido y enlace histórico.
  const [reportCopied, setReportCopied] = useState(false)

  // Entradas: hasta que exista al menos un tipo de entrada, el resto de la sección
  // (cortesías, tabla de asistentes) se oculta. null = todavía no sabemos (cargando).
  const [ticketTypeCount, setTicketTypeCount] = useState<number | null>(null)
  const hasTicketTypes = (ticketTypeCount ?? 0) > 0
  // Los editores de Entradas viven dentro de la página (sin diálogos). Mientras uno está abierto,
  // se oculta el resto de la sección para que la tarea tenga una sola superficie.
  const [ticketTypeEditorOpen, setTicketTypeEditorOpen] = useState(false)
  const [courtesyEditorOpen, setCourtesyEditorOpen] = useState(false)
  const [attendeeEditorOpen, setAttendeeEditorOpen] = useState(false)

  // Tarea 3.1 — Restricción de edad (+18): toggle en la sección Entradas; persiste
  // `events.ageRestriction` (18 o null). Lo lee el escáner de DNI en la puerta.
  const [ageRestrictionBusy, setAgeRestrictionBusy] = useState(false)
  const [ageRestrictionError, setAgeRestrictionError] = useState<string | null>(null)

  const attendeeTableRef = useRef<AttendeeTableHandle>(null)
  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])
  const resetInlineEditors = useCallback(() => {
    setTicketTypeEditorOpen(false)
    setCourtesyEditorOpen(false)
    setAttendeeEditorOpen(false)
  }, [])
  const navigateToSection = useCallback((section: SectionId) => {
    if (section !== activeSection) {
      // Al cambiar de sección, los editores en página vuelven al listado.
      resetInlineEditors()
    }
    setActiveSection(section)
    setMobileSectionOpen(true)
    if (section === "finanzas") setFinanceView("summary")
  }, [activeSection, resetInlineEditors])
  const closeMobileSection = useCallback(() => {
    resetInlineEditors()
    setFinanceView("summary")
    setMobileSectionOpen(false)
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [resetInlineEditors])

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
  // Las herramientas (balance, caja, reporte) y el detalle de ventas reemplazan todo el
  // contenido en mobile y traen su propio botón de volver: el encabezado no compite con ellos.
  const mobilePageNested =
    view !== "workspace" ||
    (activeSection === "finanzas" && financeView === "sales")
  const mobileFocus = mobileSectionOpen || view !== "workspace"
  const mobileBack = mobilePageNested
    ? null
    : !mobileSectionOpen
      ? { to: "/eventos", label: "Eventos" }
      : { onClick: closeMobileSection, label: "Secciones" }

  function renderSection() {
    if (!event || !id) return null
    switch (activeSection) {
      case "resumen":
        return (
          <SectionShell
            title="Resumen"
            action={
              <div className="flex flex-wrap items-center gap-2">
                {(role === "ADMIN" || role === "MANAGER") && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setView("cash")}
                    className="h-9 rounded-xl px-3 text-[13px] font-medium text-white/55 hover:bg-white/[0.06] hover:text-white"
                  >
                    Caja por fechas
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setView("balance")}
                  className="h-9 rounded-xl bg-white/[0.06] px-3.5 text-[13px] font-medium text-white hover:bg-white/[0.1]"
                >
                  Balance del evento
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            }
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
        return (
          <SectionShell title="Entradas">
            {!courtesyEditorOpen && !attendeeEditorOpen && (
              <TicketTypes
                eventId={id}
                refreshTrigger={refreshTick}
                onChanged={bump}
                onCountChange={setTicketTypeCount}
                onEditingChange={setTicketTypeEditorOpen}
              />
            )}
            {!ticketTypeEditorOpen && !courtesyEditorOpen && (
              <AttendeeTable
                ref={attendeeTableRef}
                eventId={id}
                refreshTrigger={refreshTick}
                layout="canvas"
                hideExportButton
                allowSale={hasTicketTypes}
                onSaleCompleted={bump}
                onEditingChange={setAttendeeEditorOpen}
              />
            )}
            {!ticketTypeEditorOpen && !attendeeEditorOpen && (
              <CourtesiesPanel
                eventId={id}
                refreshTrigger={refreshTick}
                supportsConsumptions={supportsConsumptions}
                onChanged={bump}
                onEditingChange={setCourtesyEditorOpen}
              />
            )}
            {!ticketTypeEditorOpen && !courtesyEditorOpen && !attendeeEditorOpen && (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6">
                <div className="max-w-xl">
                  <h2 className="text-[15px] font-semibold text-white">Restricción de edad</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/45">
                    Con el evento +18, la puerta pide documento y bloquea el ingreso de menores.
                  </p>
                  {ageRestrictionError && (
                    <p className="mt-1 text-[12px] text-rose-300">{ageRestrictionError}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-white/60">Evento +18</span>
                  <Switch
                    checked={event.ageRestriction != null && event.ageRestriction > 0}
                    onCheckedChange={() => void toggleAgeRestriction()}
                    disabled={ageRestrictionBusy}
                    aria-label="Evento +18"
                    className="h-6 w-11 data-[state=checked]:bg-[#FF9500] data-[state=unchecked]:bg-white/[0.16]"
                  />
                </div>
              </div>
            )}
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
            description="Cómo se ve y se comparte el evento en el link público."
            action={
              event.slug ? (
                <a
                  href={`https://crow.ar/${event.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-[#FF9500] px-4 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-[#FFAD33] active:opacity-80"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Visitar página
                </a>
              ) : undefined
            }
          >
            {event.slug ? (
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-12">
                <div className="min-w-0">
                  <EventSalesConfig event={event} onUpdated={loadEvent} />
                </div>
                <aside className="xl:sticky xl:top-20 xl:h-fit">
                  <EventFlyerMailPreview event={event} onUpdated={loadEvent} />
                </aside>
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
          <SectionShell
            title="Finanzas"
            description="Ingresos, gastos y ventas del evento."
          >
            {financeView === "sales" ? (
              <EventSalesList
                eventId={id}
                supportsConsumptions={supportsConsumptions}
                onBack={() => setFinanceView("summary")}
              />
            ) : (
              <div className="space-y-12">
                <EventIncomeSummary
                  eventId={id}
                  refreshTrigger={refreshTick}
                  supportsConsumptions={supportsConsumptions}
                  onNavigate={navigateToSection}
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFinanceView("sales")}
                      className="h-9 rounded-xl px-3 text-[13px] font-medium text-white/55 hover:bg-white/[0.06] hover:text-white"
                    >
                      Ver todas las ventas
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  }
                />

                <EventExpensesTab
                  eventId={id}
                  onExpensesChanged={bump}
                />
              </div>
            )}
          </SectionShell>
        )
    }
  }

  return (
    <EventLayout
      mobileBack={mobileBack}
      mobileNestedEnabled={mobileSectionOpen && view === "workspace"}
    >
      <div className={cn("mx-auto max-w-7xl px-4 py-6 sm:px-8", activeSection === "entradas" && "tickets-page")}>
        {/* Header permanente del evento (spec §4). En mobile se oculta al entrar a un paso. */}
        <header
          className={cn(
            "flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-6",
            mobileFocus && "hidden lg:flex"
          )}
        >
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

        {!mobileFocus ? (
          <MobileSectionNav
            sections={visibleSections}
            onSelect={(sectionId) => {
              navigateToSection(sectionId)
              window.scrollTo({ top: 0, behavior: "auto" })
            }}
          />
        ) : null}

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
            <button
              type="button"
              onClick={() => setView("workspace")}
              className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Volver al evento
            </button>
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
        <div
          className={cn(
            "flex flex-col gap-8 pt-6 lg:flex-row lg:gap-10",
            !mobileSectionOpen && "hidden lg:flex"
          )}
        >
          {/* Nav lateral fija (spec §3.2 / §4): sólo desktop. En mobile se navega por pasos. */}
          <nav className="hidden lg:sticky lg:top-20 lg:block lg:h-fit lg:w-44 lg:shrink-0">
            <div className="flex flex-col gap-1">
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

function MobileSectionNav({
  sections,
  onSelect,
}: {
  sections: { id: SectionId; label: string; Icon: LucideIcon }[]
  onSelect: (section: SectionId) => void
}) {
  return (
    <nav aria-label="Secciones del evento" className="pt-6 lg:hidden">
      <ul className="overflow-hidden rounded-2xl bg-white/[0.02]">
        {sections.map(({ id, label, Icon }, index) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]",
                index > 0 && "border-t border-white/[0.06]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
                {label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SectionShell({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const nestedActive = useEventNestedActive()
  return (
    <section className="space-y-8">
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-4",
          nestedActive && "hidden"
        )}
      >
        <div className="min-w-0">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-[14px] text-white/45">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
