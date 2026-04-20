import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { EventLayout, sectionTitle } from "@/components/events/event-layout"
import { TicketTypes } from "@/components/events/ticket-types"
import {
  AttendeeTable,
  type AttendeeTableHandle,
} from "@/components/events/attendee-table"
import { ManualSaleDialog } from "@/components/events/manual-sale-dialog"
import { EventOverviewTab } from "@/components/events/event-overview-tab"
import { EventStaffTab } from "@/components/events/event-staff-tab"
import { EventInventoryTab } from "@/components/events/event-inventory-tab"
import { EventBarsTab } from "@/components/events/event-bars-tab"
import { EventExpensesTab } from "@/components/events/event-expenses-tab"
import { EventSummaryDashboard } from "@/components/events/event-summary-dashboard"
import { EventSalesConfig } from "@/components/events/event-sales-config"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { apiFetch, ApiError } from "@/lib/api"
import { getEventShopUrl } from "@/lib/client-app-url"
import { useAuthStore } from "@/stores/auth-store"
import { ChevronLeft, Loader2, MoreHorizontal, Plus } from "lucide-react"
import type { ApiEvent } from "@/types/events"

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function deriveStatus(ev: {
  date: string
  isActive: boolean | null
}): "draft" | "active" | "finished" {
  if (ev.isActive === false) return "draft"
  const d = new Date(ev.date)
  if (Number.isNaN(d.getTime())) return "active"
  return d.getTime() < Date.now() ? "finished" : "active"
}

const minimalShell =
  "min-h-screen bg-[#F2F2F7] text-black transition-colors duration-200 dark:bg-black dark:text-white"

function MinimalBackBar() {
  return (
    <div className="border-b border-zinc-200/50 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#8E8E93] transition-colors hover:text-foreground dark:text-[#98989D]"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>
    </div>
  )
}

export function EventDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState("general")
  const [refreshTick, setRefreshTick] = useState(0)
  const [saleOpen, setSaleOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const attendeeTableRef = useRef<AttendeeTableHandle>(null)

  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])

  const publicShopUrl = id ? getEventShopUrl(id) : ""

  async function copyPublicShopLink() {
    if (!publicShopUrl) return
    try {
      await navigator.clipboard.writeText(publicShopUrl)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

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

  if (!id) {
    return <Navigate to="/events" replace />
  }

  if (loading) {
    return (
      <div className={`flex min-h-screen flex-col ${minimalShell}`}>
        <MinimalBackBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" />
          <p className="text-[15px] text-[#8E8E93]">Cargando evento…</p>
        </div>
      </div>
    )
  }

  if (loadError || !event) {
    return (
      <div className={`flex min-h-screen flex-col ${minimalShell}`}>
        <MinimalBackBar />
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="max-w-md text-center">
            <p className="text-[17px] font-semibold text-red-600 dark:text-red-400">
              {loadError ?? "No disponible"}
            </p>
            <Button
              asChild
              variant="ghost"
              className="mt-6 h-11 rounded-xl text-[15px] font-semibold text-[#FF9500]"
            >
              <Link to="/events">Volver a eventos</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const subtitle = [formatEventDate(event.date), event.location].filter(Boolean).join(" · ")

  return (
    <EventLayout
      eventName={event.name}
      eventSubtitle={subtitle}
      status={deriveStatus(event)}
      activeSection={activeTab}
      onSectionChange={setActiveTab}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:min-h-screen">
        {/* Header traslúcido: solo título + 1 acción primaria opcional */}
        <header className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/50 bg-[#F2F2F7]/70 px-6 py-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 sm:px-10 sm:py-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {sectionTitle(activeTab)}
            </h1>

            {activeTab === "tickets" ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setSaleOpen(true)}
                  className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 hover:bg-[#FF9500]/90 active:opacity-80"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Venta manual</span>
                  <span className="sm:hidden">Venta</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-[#8E8E93] hover:bg-zinc-500/10 dark:text-[#98989D]"
                      aria-label="Más acciones"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuItem
                      className="rounded-lg text-[15px]"
                      onSelect={() => void copyPublicShopLink()}
                    >
                      {linkCopied ? "¡Link copiado!" : "Copiar link público"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="rounded-lg text-[15px]"
                      onSelect={() => attendeeTableRef.current?.exportCsv()}
                    >
                      Exportar CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "general" && (
            <div className="space-y-12 px-6 py-8 sm:px-10 sm:py-10">
              <Section title="Resumen ejecutivo">
                <EventSummaryDashboard eventId={id} refreshTrigger={refreshTick} />
              </Section>

              <Section title="Configuración de Ventas">
                <EventSalesConfig event={event} onUpdated={loadEvent} />
              </Section>

              <Section title="Inventario">
                <EventInventoryTab eventId={id} />
              </Section>

              <Section title="Barras">
                <EventBarsTab eventId={id} embedded />
              </Section>

              <Section title="Personal">
                <EventStaffTab eventId={id} embedded />
              </Section>

              <Section title="Gastos">
                <EventExpensesTab eventId={id} embedded onExpensesChanged={bump} />
              </Section>
            </div>
          )}

          {activeTab === "tickets" && (
            <div className="flex flex-col gap-10 px-6 py-8 pb-32 sm:px-10 sm:py-10 lg:pb-10">
              <TicketTypes
                eventId={id}
                refreshTrigger={refreshTick}
                onChanged={bump}
                layout="compact"
              />
              <AttendeeTable
                ref={attendeeTableRef}
                eventId={id}
                refreshTrigger={refreshTick}
                layout="canvas"
                hideExportButton
              />
            </div>
          )}

          {activeTab === "metrics" && (
            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <EventOverviewTab eventId={id} refreshTrigger={refreshTick} />
            </div>
          )}
        </div>

        {/* Mobile FAB: sola acción primaria. El resto vive en ⋯ del header */}
        {activeTab === "tickets" ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-5 pb-5 lg:hidden">
            <Button
              type="button"
              onClick={() => setSaleOpen(true)}
              className="pointer-events-auto h-14 gap-2 rounded-full bg-[#FF9500] px-6 text-[15px] font-semibold text-white shadow-none transition-all duration-200 active:opacity-70"
            >
              <Plus className="h-5 w-5" />
              Venta manual
            </Button>
          </div>
        ) : null}
      </div>

      <ManualSaleDialog
        eventId={id}
        open={saleOpen}
        onOpenChange={setSaleOpen}
        onSold={() => {
          bump()
        }}
      />
    </EventLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  )
}
