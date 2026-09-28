import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ChevronRight, Loader2 } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { eventStatusLabel } from "@/lib/event-status"
import type { ApiEvent } from "@/types/events"

type EventsListResponse = { events: ApiEvent[] }

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Pantalla del promotor general: los eventos en los que la productora lo incluyó. Es la misma
 * lista que abre el admin, reducida a lo suyo: sin crear, duplicar ni eliminar eventos y sin
 * cifras de la productora. El backend ya acota `GET /events` a sus asignaciones (`event_staff`),
 * igual que hace con Seguridad.
 */
export function GeneralPromoterEventsPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<EventsListResponse>("/events", { method: "GET", token })
      setEvents(data.events)
    } catch (err) {
      setEvents([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los eventos")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 lg:px-8 lg:py-14">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Eventos</h1>
            <p className="mt-1.5 text-[15px] text-white/40">
              Los eventos en los que estás incluido.
            </p>
          </header>

          {loading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
            </div>
          ) : error ? (
            <p className="text-[15px] text-red-400/80">{error}</p>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] px-7 py-12 text-center text-[15px] text-white/45">
              Todavía no te incluyeron en ningún evento.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
              {events.map((event) => {
                const subtitle = [formatEventDate(event.date), event.venue ?? event.location]
                  .filter(Boolean)
                  .join(" · ")
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => navigate(`/eventos/${event.id}`)}
                    className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold text-white/90">
                        {event.name}
                      </span>
                      {subtitle ? (
                        <span className="mt-0.5 block truncate text-[14px] text-white/40">
                          {subtitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[12px] uppercase tracking-wide text-white/30">
                      {eventStatusLabel(event.status)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
