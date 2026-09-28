import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { EventStaffTab } from "@/components/events/event-staff-tab"
import { GeneralPromoterSalesPanel } from "@/components/events/general-promoter-sales"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { eventStatusLabel } from "@/lib/event-status"
import type { ApiEvent } from "@/types/events"

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Evento visto por el promotor general: el tablero de ventas de su cartera (entradas vendidas y
 * recaudado, por promotor y en total) y, debajo, la gestión de esos promotores. No reusa
 * `EventDashboardPage` a propósito: esa página trae la caja, las métricas de la productora y la
 * máquina de estados del evento (incluido el avance automático a "En vivo" por hora de puertas),
 * que no le corresponden a este rol.
 */
export function GeneralPromoterEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Cambia cuando la cartera cambia (alta o baja de un promotor) para que el tablero se rehaga.
  const [salesRefresh, setSalesRefresh] = useState(0)

  const load = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ event: ApiEvent }>(`/events/${id}`, { method: "GET", token })
      setEvent(data.event)
    } catch (err) {
      setEvent(null)
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el evento")
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => {
    void load()
  }, [load])

  const subtitle = event
    ? [formatEventDate(event.date), event.venue ?? event.location].filter(Boolean).join(" · ")
    : ""

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
          <button
            type="button"
            onClick={() => navigate("/eventos")}
            className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-white/45 transition-colors hover:text-white/80"
          >
            <ArrowLeft className="h-4 w-4" />
            Eventos
          </button>

          {loading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
            </div>
          ) : error ? (
            <p className="text-[15px] text-red-400/80">{error}</p>
          ) : id ? (
            <>
              <header className="mb-7">
                <p className="text-[12px] uppercase tracking-[0.18em] text-white/40">
                  {event ? eventStatusLabel(event.status) : ""}
                </p>
                <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                  {event?.name}
                </h1>
                {subtitle ? <p className="mt-1.5 text-[15px] text-white/45">{subtitle}</p> : null}
              </header>

              <div className="space-y-6">
                <GeneralPromoterSalesPanel eventId={id} refreshToken={salesRefresh} />

                <section className="rounded-3xl border border-white/[0.08] bg-white/[0.02] px-5 py-6 sm:px-6">
                  <EventStaffTab
                    eventId={id}
                    eventLinkId={event?.slug ?? id}
                    inviteAccessHint="El enlace inicia sesión directamente y sirve para volver a entrar, sin nombre ni PIN."
                    onTeamChange={() => setSalesRefresh((n) => n + 1)}
                  />
                </section>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
