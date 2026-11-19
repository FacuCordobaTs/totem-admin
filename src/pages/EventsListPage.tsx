import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import {
  CreateEventDialog,
  CreateEventHero,
} from "@/components/events/create-event-flow"
import { CalendarDays, ChevronRight, Loader2, MapPin, Plus, Ticket, Trash2 } from "lucide-react"
import type { ApiEvent } from "@/types/events"

type EventsListResponse = { events: ApiEvent[] }

function formatEventDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function EventsListPage() {
  const token = useAuthStore((s) => s.token)
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"
  const productoraName = useAuthStore((s) => s.staff?.tenantName?.trim())

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiEvent | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const hasTenant = tenantId != null && tenantId !== ""

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
    if (!token) return
    if (!hasTenant) {
      setLoading(false)
      setEvents([])
      return
    }
    void load()
  }, [token, hasTenant, load])

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events]
  )

  const needsProductora = !hasTenant

  async function deleteEvent() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiFetch(`/events/${deleteTarget.id}`, { method: "DELETE", token })
      setEvents((current) => current.filter((event) => event.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar el evento")
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading / onboarding ──────────────────────────────────────────────────────────────────
  if (needsProductora) {
    return (
      <div className="flex min-h-screen flex-col bg-black">
        <Header />
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
          {isAdmin ? <ProductoraSetupCard /> : <ProductoraWaitingCard />}
        </div>
      </div>
    )
  }

  const empty = !loading && !error && events.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {productoraName ? `Hola, ${productoraName}` : "Hola, te damos la bienvenida"}
              </h1>
              <p className="mt-2 text-[15px] text-zinc-400">Todos tus eventos en un solo lugar.</p>
            </div>
            {!empty && (
              <Button
                className="h-11 gap-2 rounded-xl bg-[#FF9500] px-5 text-[14px] font-semibold text-black hover:bg-[#FFAD33]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Crear evento
              </Button>
            )}
          </div>
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Cargando eventos">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-hidden />
            </div>
          ) : empty ? (
            <CreateEventHero token={token} events={events} />
          ) : error ? (
            <div className="space-y-4" role="alert">
              <p className="text-[15px] text-red-400">{error}</p>
              <Button variant="outline" onClick={() => void load()}>Volver a intentar</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Tus eventos">
              {sortedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDelete={isAdmin ? () => { setDeleteError(null); setDeleteTarget(event) } : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        token={token}
        events={sortedEvents}
      />
      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Se eliminarán permanentemente las entradas, ventas, barras, stock, gastos y demás datos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p role="alert" className="text-sm text-red-400">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="border-zinc-700 bg-transparent text-white hover:bg-white/10 hover:text-white">Cancelar</AlertDialogCancel>
            <Button disabled={deleting} onClick={() => void deleteEvent()} className="bg-red-600 text-white hover:bg-red-500">
              {deleting ? "Eliminando…" : "Eliminar evento"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EventCard({ event, onDelete }: { event: ApiEvent; onDelete?: () => void }) {
  const location = event.venue ?? event.location
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 transition-colors hover:border-white/25 focus-within:border-[#FF9500]">
      <Link to={`/eventos/${event.id}`} className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF9500]">
        <div className="aspect-[16/9] overflow-hidden bg-zinc-900">
          {event.imageUrl ? (
            <img src={event.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center" aria-hidden>
              <Ticket className="h-12 w-12 text-zinc-600" strokeWidth={1.25} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h2 className="break-words text-xl font-semibold leading-snug tracking-tight text-white">{event.name}</h2>
          <div className="mt-4 space-y-2 text-sm text-zinc-400">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden /><time dateTime={event.date}>{formatEventDateShort(event.date)}</time></p>
            {location && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="line-clamp-2 break-words">{location}</span></p>}
          </div>
          <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-medium text-white">
            Abrir evento <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </Link>
      {onDelete && (
        <button
          type="button"
          aria-label={`Eliminar ${event.name}`}
          title="Eliminar evento"
          onClick={onDelete}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg bg-black/80 text-zinc-300 transition-colors hover:bg-red-950 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9500]"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      )}
    </article>
  )
}
