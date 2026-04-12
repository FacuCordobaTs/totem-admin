import { useCallback, useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { EventHeader } from "@/components/events/event-header"
import { TicketTypes } from "@/components/events/ticket-types"
import { AttendeeTable } from "@/components/events/attendee-table"
import { ManualSaleDialog } from "@/components/events/manual-sale-dialog"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Link2, Ticket } from "lucide-react"
import type { ApiEvent } from "@/types/events"

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

export function EventDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState("tickets")
  const [refreshTick, setRefreshTick] = useState(0)
  const [saleOpen, setSaleOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const bump = useCallback(() => setRefreshTick((t) => t + 1), [])

  const publicSaleUrl =
    typeof window !== "undefined" && id ? `${window.location.origin}/p/${id}` : ""

  async function copyPublicSaleLink() {
    if (!publicSaleUrl) return
    try {
      await navigator.clipboard.writeText(publicSaleUrl)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      /* portapapeles no disponible */
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
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center lg:pl-16">
          <p className="text-muted-foreground">Cargando evento…</p>
        </main>
      </div>
    )
  }

  if (loadError || !event) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 lg:pl-16">
          <p className="text-destructive">{loadError ?? "No disponible"}</p>
          <Button asChild variant="outline">
            <Link to="/events">Volver a eventos</Link>
          </Button>
        </main>
      </div>
    )
  }

  const subtitle = [formatEventDate(event.date), event.location].filter(Boolean).join(" · ")

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <EventHeader
          eventName={event.name}
          eventDate={subtitle}
          status={deriveStatus(event)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="p-4 lg:p-6">
          {activeTab === "tickets" && (
            <>
              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm text-muted-foreground">
                  Tipos de entrada, venta pública y boletería manual.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 gap-2 text-base font-semibold"
                    onClick={() => void copyPublicSaleLink()}
                  >
                    <Link2 className="h-5 w-5" />
                    {linkCopied ? "¡Link copiado!" : "Copiar link de venta pública"}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 gap-2 text-base font-semibold"
                    onClick={() => setSaleOpen(true)}
                  >
                    <Ticket className="h-5 w-5" />
                    Venta manual
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-6">
                <TicketTypes
                  eventId={id}
                  refreshTrigger={refreshTick}
                  onChanged={bump}
                />
                <AttendeeTable eventId={id} refreshTrigger={refreshTick} />
              </div>
            </>
          )}
          {activeTab === "summary" && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground">Vista de resumen próximamente</p>
            </div>
          )}
          {activeTab === "bar-stock" && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground">
                Bar y stock: consultá la página de Inventario
              </p>
            </div>
          )}
          {activeTab === "staff" && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground">
                <Link to="/staff" className="text-primary underline-offset-4 hover:underline">
                  Ir a Personal
                </Link>
              </p>
            </div>
          )}
          {activeTab === "gate-control" && (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground">Control de acceso en puerta</p>
              <Button asChild variant="outline">
                <Link to="/scanner">Abrir escáner</Link>
              </Button>
            </div>
          )}
        </div>
      </main>

      <ManualSaleDialog
        eventId={id}
        open={saleOpen}
        onOpenChange={setSaleOpen}
        onSold={() => {
          bump()
        }}
      />
    </div>
  )
}
