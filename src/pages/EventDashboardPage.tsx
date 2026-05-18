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
import { useAuthStore } from "@/stores/auth-store"
import { Check, Copy, ChevronLeft, Loader2, Plus, ArrowRight } from "lucide-react"
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
  const [salesState, setSalesState] = useState({ saving: false, hasSlugError: false })

  const attendeeTableRef = useRef<AttendeeTableHandle>(null)
  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])


  async function copyPublicShopLink(slug: string | null) {
    if (!slug) return
    try {
      await navigator.clipboard.writeText(`https://crow.ar/${slug}`)
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

  if (!id) return <Navigate to="/eventos" replace />

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
          <Link to="/eventos">
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
      linkCopied={linkCopied}
      onCopyLink={() => void copyPublicShopLink(event.slug)}
    >
      <div className="mx-auto max-w-6xl space-y-24 px-4 py-10 pb-32 sm:px-8">

         <div className="grid gap-6 sm:grid-cols-[1fr_2fr]">
            <EventImageUploader event={event} onUpdated={loadEvent} compact />
            <div className="flex flex-col">
              <h1 className="text-4xl font-extrabold">{event.name}</h1>
              {subtitle && (
                <p className="truncate text-md my-2 text-zinc-500">{subtitle}</p>
              )}
              <EventSalesConfig
                event={event}
                formId={`sales-config-${id}`}
                onUpdated={loadEvent}
                onStateChange={setSalesState}
              />
              <div className="mt-auto flex justify-end gap-3 pt-6">
                <Button
                  type="button"
                  onClick={() => void copyPublicShopLink(event.slug)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.15] bg-black hover:bg-black px-5 h-14 py-1.5 text-[13px] font-medium text-white/50 transition-all active:opacity-70"
                >
                  {linkCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {linkCopied ? "Copiado" : "Copiar link"}
                  </span>
                </Button>
                <Button
                  type="submit"
                  form={`sales-config-${id}`}
                  disabled={salesState.saving || salesState.hasSlugError}
                  className="h-14 min-w-[140px] rounded-xl bg-[#FF9500] px-5 text-[14px] font-semibold text-white shadow-none hover:bg-[#FF9500]/90 disabled:opacity-50"
                >
                  {salesState.saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Guardando…
                    </>
                  ) : (
                    "Guardar cambios"
                  )}
                </Button>
              </div>
            </div>
          </div>

        {/* Entradas */}
        <section id="entradas" className="scroll-mt-36 space-y-8">
          <SectionHeading>Entradas</SectionHeading>
          <TicketTypes
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
            onNewSale={() => setSaleOpen(true)}
          />
        </section>

        {/* Bar */}
        <section id="bar" className="scroll-mt-36 space-y-10">
          <SectionHeading>Bar</SectionHeading>
          <EventInventoryTab eventId={id} onLogisticsChange={bump} />
          <EventBarsTab eventId={id} embedded />
          <div className="flex justify-end border-t border-white/[0.08] pt-4">
            <Link
              to={`/catalogo?from=${id}`}
              className="flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
            >
              Gestionar catálogo global
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Personal */}
        <section id="personal" className="scroll-mt-36 space-y-10">
          <SectionHeading>Personal</SectionHeading>
          <EventStaffTab eventId={id} eventStatus={deriveStatus(event)} />
          <div className="flex justify-end border-t border-white/[0.08] pt-4">
            <Link
              to={`/staff?from=${id}`}
              className="flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
            >
              Gestionar personal global
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Finanzas */}
        <section id="finanzas" className="scroll-mt-36 space-y-10">
          <SectionHeading>Finanzas</SectionHeading>
          <EventOverviewTab eventId={id} refreshTrigger={refreshTick} />
          <EventExpensesTab eventId={id} embedded onExpensesChanged={bump} />
        </section>
      </div>


        {/* Resumen */}
        <section id="resumen" className="scroll-mt-36 space-y-10">
          <SectionHeading>Resumen</SectionHeading>
          <EventSummaryDashboard eventId={id} refreshTrigger={refreshTick} />
        </section>

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
    <h2 className="text-4xl font-extrabold tracking-tight ">{children}</h2>
  )
}
