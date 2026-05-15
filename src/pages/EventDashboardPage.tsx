import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { EventLayout, NAV_SECTIONS } from "@/components/events/event-layout"
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
import { EventImageUploader } from "@/components/events/event-image-uploader"
import { EventSalesConfig } from "@/components/events/event-sales-config"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { getEventShopUrl } from "@/lib/client-app-url"
import { useAuthStore } from "@/stores/auth-store"
import { ChevronLeft, Loader2, Plus } from "lucide-react"
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

const SECTION_IDS = NAV_SECTIONS.map((s) => s.id)

export function EventDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeSection, setActiveSection] = useState<string>("resumen")
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

  // Scroll-spy: active section = last section whose top is above the header
  useEffect(() => {
    const handleScroll = () => {
      const HEADER_HEIGHT = 130
      let current = SECTION_IDS[0]
      for (const sectionId of SECTION_IDS) {
        const el = document.getElementById(sectionId)
        if (!el) continue
        if (el.getBoundingClientRect().top <= HEADER_HEIGHT + 24) {
          current = sectionId
        }
      }
      setActiveSection(current)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
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

  if (!id) return <Navigate to="/events" replace />

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F2F2F7] dark:bg-[#0a0a0a]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" />
        <p className="text-[15px] text-zinc-500">Cargando evento…</p>
      </div>
    )
  }

  if (loadError || !event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#F2F2F7] dark:bg-[#0a0a0a]">
        <p className="text-[17px] font-semibold text-red-600 dark:text-red-400">
          {loadError ?? "No disponible"}
        </p>
        <Button asChild variant="ghost" className="text-[#FF9500]">
          <Link to="/events">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Volver a eventos
          </Link>
        </Button>
      </div>
    )
  }

  const subtitle = [formatEventDate(event.date), event.location]
    .filter(Boolean)
    .join(" · ")

  return (
    <EventLayout
      eventName={event.name}
      eventSubtitle={subtitle}
      status={deriveStatus(event)}
      activeSection={activeSection}
      shopUrl={publicShopUrl}
      linkCopied={linkCopied}
      onCopyLink={() => void copyPublicShopLink()}
    >
      <div className="mx-auto max-w-6xl space-y-24 px-4 py-10 pb-32 sm:px-8">

        {/* Resumen */}
        <section id="resumen" className="scroll-mt-36 space-y-10">
          <SectionHeading>Resumen</SectionHeading>
          <EventSummaryDashboard eventId={id} refreshTrigger={refreshTick} />
          <div className="grid gap-6 sm:grid-cols-[1fr_2fr]">
            <EventImageUploader event={event} onUpdated={loadEvent} compact />
            <EventSalesConfig event={event} onUpdated={loadEvent} />
          </div>
        </section>

        {/* Entradas */}
        <section id="entradas" className="scroll-mt-36 space-y-8">
          <div className="flex items-center justify-between gap-4">
            <SectionHeading>Entradas</SectionHeading>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => setSaleOpen(true)}
                className="h-9 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 active:opacity-80"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Venta manual</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => attendeeTableRef.current?.exportCsv()}
                className="h-9 rounded-xl border-zinc-300 px-3 text-[13px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                Exportar CSV
              </Button>
            </div>
          </div>
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
        </section>

        {/* Bar */}
        <section id="bar" className="scroll-mt-36 space-y-10">
          <SectionHeading>Bar</SectionHeading>
          <EventInventoryTab eventId={id} onLogisticsChange={bump} />
          <EventBarsTab eventId={id} embedded />
        </section>

        {/* Personal */}
        <section id="personal" className="scroll-mt-36 space-y-10">
          <SectionHeading>Personal</SectionHeading>
          <EventStaffTab eventId={id} eventStatus={deriveStatus(event)} />
        </section>

        {/* Finanzas */}
        <section id="finanzas" className="scroll-mt-36 space-y-10">
          <SectionHeading>Finanzas</SectionHeading>
          <EventOverviewTab eventId={id} refreshTrigger={refreshTick} />
          <EventExpensesTab eventId={id} embedded onExpensesChanged={bump} />
        </section>
      </div>

      {/* Mobile FAB for manual sale */}
      {activeSection === "entradas" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-5 pb-5 lg:hidden">
          <Button
            type="button"
            onClick={() => setSaleOpen(true)}
            className="pointer-events-auto h-14 gap-2 rounded-full bg-[#FF9500] px-6 text-[15px] font-semibold text-white active:opacity-70"
          >
            <Plus className="h-5 w-5" />
            Venta manual
          </Button>
        </div>
      )}

      <ManualSaleDialog
        eventId={id}
        open={saleOpen}
        onOpenChange={setSaleOpen}
        onSold={bump}
      />
    </EventLayout>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-medium tracking-tight sm:text-2xl">{children}</h2>
  )
}
