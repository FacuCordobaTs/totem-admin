import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { MpConnectionCard } from "@/components/settings/mp-connection-card"
import { EventLivePanel } from "@/components/events/event-live-panel"
import { eventStatusLabel } from "@/lib/event-status"
import { EVENT_OPERATION_MODE_OPTIONS } from "@/lib/event-operation-mode"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import { ArrowLeft, Boxes, Check, ChevronRight, Loader2, MapPin, Plus, Ticket, Trash2, Wine } from "lucide-react"
import type { ApiEvent, EventOperationMode } from "@/types/events"

type EventsListResponse = { events: ApiEvent[] }
type Readiness = { canOpenSale: boolean; missing: string[] }

function formatEventDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function money(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (!Number.isFinite(n)) return "—"
  const isInt = Number.isInteger(n)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(n)
}

function int(n: number): string {
  return n.toLocaleString("es-AR")
}

/**
 * Spec §3 — la Home responde una sola pregunta: ¿en qué estado está mi operación ahora?
 * Tres formas excluyentes, gobernadas por `event.status` (la máquina de 4 estados):
 *   1. Sin eventos           → la creación ES el empty state (los tres campos, centrados).
 *   2. Con un evento en vivo  → ese evento toma la Home completa (panel de la noche).
 *   3. Forma normal           → próximo evento protagonista + futuros en tono menor + historial.
 */
export function EventsListPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  // ── Buckets según estado ──────────────────────────────────────────────────────────────
  const { liveEvent, protagonist, upcomingRest, history } = useMemo(() => {
    const live = events.find((e) => e.status === "live") ?? null
    const closed = events
      .filter((e) => e.status === "closed")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    // No cerrados y no en vivo, ordenados por fecha ascendente: el próximo es el protagonista.
    const openish = events
      .filter((e) => e.status !== "closed" && e.status !== "live")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const now = Date.now()
    const future = openish.filter((e) => new Date(e.date).getTime() >= now)
    const proto = future[0] ?? openish[openish.length - 1] ?? null
    const rest = proto ? openish.filter((e) => e.id !== proto.id) : openish
    return { liveEvent: live, protagonist: proto, upcomingRest: rest, history: closed }
  }, [events])

  // "Partir de: [último evento]" (spec §3 / §5.2): el duplicado es el camino por defecto del
  // segundo evento en adelante. Origen = el último cerrado (evento completo, con toda su config)
  // o, si no hay cerrados, el más reciente por fecha.
  const duplicateSource = useMemo(() => {
    if (events.length === 0) return null
    const closed = events.filter((e) => e.status === "closed")
    const pool = closed.length > 0 ? closed : events
    return (
      [...pool].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
    )
  }, [events])

  const needsProductora = !hasTenant

  async function deleteEvent() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/events/${deleteTarget.id}`, { method: "DELETE", token })
      setEvents((current) => current.filter((event) => event.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el evento")
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading / onboarding ─────────────────────────────────────────────────────────────
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

  // ── Forma 2: evento en vivo toma la Home completa (spec §3) ──────────────────────────
  if (liveEvent) {
    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <Header />
        <main className="flex-1">
          <EventLivePanel
            eventId={liveEvent.id}
            eventName={liveEvent.name}
            operationMode={liveEvent.operationMode}
            onIntervene={() => navigate(`/eventos/${liveEvent.id}`)}
          />
        </main>
      </div>
    )
  }

  const empty = !loading && !error && events.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8 lg:py-14">
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
            </div>
          ) : empty ? (
            // Forma 1: la creación ES el empty state — sin texto de bienvenida.
            <CreateHero navigate={navigate} token={token} tenantId={tenantId} />
          ) : (
            <>
              {error ? (
                <p className="mb-6 text-[15px] text-red-400/80">{error}</p>
              ) : null}

              <div className="mb-8 flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Eventos
                </h1>
                <Button
                  className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Crear evento
                </Button>
              </div>

              {/* Protagonista: el próximo evento con su señal vital según estado */}
              {protagonist ? (
                <ProtagonistCard
                  event={protagonist}
                  token={token}
                  onOpen={() => navigate(`/eventos/${protagonist.id}`)}
                  onDelete={isAdmin ? () => setDeleteTarget(protagonist) : undefined}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-white/[0.12] px-7 py-10 text-left text-[16px] text-white/50 transition-colors hover:border-white/25 hover:text-white/70"
                >
                  <Plus className="h-5 w-5" />
                  Crear tu próximo evento
                </button>
              )}

              {/* Futuros en tono menor */}
              {upcomingRest.length > 0 && (
                <div className="mt-10">
                  <p className="mb-3 text-[12px] uppercase tracking-[0.18em] text-white/30">
                    próximos
                  </p>
                  <div className="divide-y divide-white/[0.06]">
                    {upcomingRest.map((ev) => (
                      <MinorRow
                        key={ev.id}
                        event={ev}
                        onOpen={() => navigate(`/eventos/${ev.id}`)}
                        onDelete={isAdmin ? () => setDeleteTarget(ev) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Historial: cada evento pasado en una línea con su neto */}
              {history.length > 0 && (
                <div className="mt-12">
                  <p className="mb-3 text-[12px] uppercase tracking-[0.18em] text-white/30">
                    historial
                  </p>
                  <div className="divide-y divide-white/[0.06]">
                    {history.map((ev) => (
                      <HistoryRow
                        key={ev.id}
                        event={ev}
                        token={token}
                        onOpen={() => navigate(`/eventos/${ev.id}`)}
                        onDelete={isAdmin ? () => setDeleteTarget(ev) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        token={token}
        navigate={navigate}
        source={duplicateSource}
      />
      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Se eliminarán permanentemente las entradas, ventas, barras, stock, gastos y demás datos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
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

/* ── Protagonista: pieza grande con señal vital ─────────────────────────────────────────── */

function ProtagonistCard({
  event,
  token,
  onOpen,
  onDelete,
}: {
  event: ApiEvent
  token: string | null
  onOpen: () => void
  onDelete?: () => void
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    if (event.status === "draft") {
      void apiFetch<Readiness>(`/events/${event.id}/readiness`, { method: "GET", token })
        .then((r) => !cancelled && setReadiness(r))
        .catch(() => {})
    } else if (event.status === "on_sale") {
      void apiFetch<EventSummaryResponse>(`/events/${event.id}/summary`, { method: "GET", token })
        .then((s) => !cancelled && setSummary(s))
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [token, event.id, event.status])

  const subtitle = [formatEventDateShort(event.date), event.venue ?? event.location]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="group relative rounded-3xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
      <button type="button" onClick={onOpen} className="block w-full px-7 py-8 pr-16 text-left">
      <span className="text-[12px] uppercase tracking-[0.18em] text-white/40">
        {eventStatusLabel(event.status)}
      </span>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        {event.name}
      </h2>
      {subtitle && <p className="mt-1.5 text-[15px] text-white/45">{subtitle}</p>}

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        {event.status === "draft" ? (
          <p className="text-[16px] leading-relaxed text-white/70">
            {readiness == null
              ? " "
              : readiness.canOpenSale
                ? "Está todo listo. Cuando quieras, abrí la venta."
                : `Falta ${readiness.missing.join(" y ")}.`}
          </p>
        ) : event.status === "on_sale" ? (
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-[13px] lowercase text-white/40">vendidas</p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-white">
                {summary ? int(summary.ticketsSold) : " "}
                {summary?.ticketCapacity != null && (
                  <span className="text-xl font-medium text-white/35">
                    {" "}
                    / {int(summary.ticketCapacity)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[13px] lowercase text-white/40">recaudado</p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-white">
                {summary ? money(summary.grossRevenue) : " "}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      </button>
      {onDelete ? <DeleteEventButton onClick={onDelete} /> : null}
    </div>
  )
}

/* ── Filas menores ──────────────────────────────────────────────────────────────────────── */

function MinorRow({ event, onOpen, onDelete }: { event: ApiEvent; onOpen: () => void; onDelete?: () => void }) {
  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 py-3.5 pr-11 text-left transition-colors hover:opacity-80">
      <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{event.name}</span>
      <span className="hidden shrink-0 text-[14px] text-white/40 sm:inline">
        {formatEventDateShort(event.date)}
      </span>
      <span className="shrink-0 text-[12px] uppercase tracking-wide text-white/30">
        {eventStatusLabel(event.status)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
      </button>
      {onDelete ? <DeleteEventButton onClick={onDelete} compact /> : null}
    </div>
  )
}

function HistoryRow({
  event,
  token,
  onOpen,
  onDelete,
}: {
  event: ApiEvent
  token: string | null
  onOpen: () => void
  onDelete?: () => void
}) {
  // Neto: preferí la liquidación congelada (4.4). Para cerrados legacy (sin reporte),
  // caé a /summary.netProfit (puede ser null para roles sin permisos financieros).
  const [legacyNet, setLegacyNet] = useState<number | null | undefined>(undefined)
  const reportNet = event.closingReport
    ? Number.parseFloat(event.closingReport.netReal)
    : null

  useEffect(() => {
    if (event.closingReport || !token) return
    let cancelled = false
    void apiFetch<EventSummaryResponse>(`/events/${event.id}/summary`, { method: "GET", token })
      .then((s) => {
        if (cancelled) return
        setLegacyNet(s.netProfit != null ? Number.parseFloat(s.netProfit) : null)
      })
      .catch(() => !cancelled && setLegacyNet(null))
    return () => {
      cancelled = true
    }
  }, [event.id, event.closingReport, token])

  const net = event.closingReport ? reportNet : legacyNet
  const netKnown = net != null && Number.isFinite(net)

  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 py-3.5 pr-11 text-left transition-colors hover:opacity-80">
      <span className="min-w-0 flex-1 truncate text-white/70">{event.name}</span>
      <span className="hidden shrink-0 text-[14px] text-white/30 sm:inline">
        {formatEventDateShort(event.date)}
      </span>
      <span
        className={
          "shrink-0 text-[15px] font-semibold tabular-nums " +
          (netKnown ? (net! >= 0 ? "text-emerald-400/90" : "text-red-400/90") : "text-white/25")
        }
      >
        {netKnown ? money(net!) : "—"}
      </span>
      </button>
      {onDelete ? <DeleteEventButton onClick={onDelete} compact /> : null}
    </div>
  )
}

function DeleteEventButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Eliminar evento"
      title="Eliminar evento"
      onClick={onClick}
      className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/25 transition-colors hover:bg-red-500/15 hover:text-red-400 ${compact ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

/* ── Creación ───────────────────────────────────────────────────────────────────────────── */

/**
 * Los tres campos de crear evento, listos para el empty state (spec §3: la puerta, no el texto).
 * Si `source` existe, se ofrece "Partir de: [último evento]" (default ON): en vez de crear en
 * blanco, se golpea `POST /events/:id/duplicate` (clona entradas, menú, precios y equipo) pisando
 * nombre/fecha/lugar. Duplicar es el camino por defecto del segundo evento en adelante (spec §5.2).
 */
function useCreateEvent(
  token: string | null,
  navigate: ReturnType<typeof useNavigate>,
  source?: ApiEvent | null,
) {
  const [name, setName] = useState("")
  const [date, setDate] = useState("") // YYYY-MM-DD
  const [time, setTime] = useState("") // HH:mm (opcional)
  const [venue, setVenue] = useState("")
  const [location, setLocation] = useState("")
  const [operationMode, setOperationMode] = useState<EventOperationMode | null>(null)
  const [fromSource, setFromSource] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDuplicate = source != null

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!token) return
    setError(null)
    if (!operationMode) {
      setError("Elegí cómo vas a operar este evento")
      return
    }
    if (!name.trim() && !(canDuplicate && fromSource)) {
      setError("Escribí el nombre del evento")
      return
    }
    if (!date) {
      setError("Elegí una fecha")
      return
    }
    // La hora es opcional: si no la cargan, arrancamos a medianoche.
    const iso = new Date(`${date}T${time || "00:00"}`)
    if (Number.isNaN(iso.getTime())) {
      setError("Fecha inválida")
      return
    }
    setLoading(true)
    try {
      const duplicating = canDuplicate && fromSource
      const endpoint = duplicating ? `/events/${source!.id}/duplicate` : "/events"
      const res = await apiFetch<{ event: ApiEvent }>(endpoint, {
        method: "POST",
        token,
        body: JSON.stringify({
          name: name.trim() || undefined,
          date: iso.toISOString(),
          venue: venue.trim() || undefined,
          location: location.trim() || undefined,
          operationMode,
        }),
      })
      navigate(`/eventos/${res.event.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el evento")
      setLoading(false)
    }
  }

  return {
    name,
    setName,
    date,
    setDate,
    time,
    setTime,
    venue,
    setVenue,
    location,
    setLocation,
    operationMode,
    setOperationMode,
    fromSource,
    setFromSource,
    canDuplicate,
    source: source ?? null,
    loading,
    error,
    setError,
    submit,
  }
}

type PlaceSuggestion = { place_id: number; display_name: string }

/** Búsqueda de direcciones sin clave; la dirección elegida es la que se guarda para el mapa. */
function LocationPicker({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (query.trim().length < 3 || query === value) {
      setSuggestions([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error("No se pudieron buscar ubicaciones")
        setSuggestions((await response.json()) as PlaceSuggestion[])
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") setSuggestions([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 350)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, value])

  const select = (place: PlaceSuggestion) => {
    setQuery(place.display_name)
    onChange(place.display_name)
    setSuggestions([])
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange("")
          }}
          className={className}
          placeholder="Buscá una dirección o lugar"
          autoComplete="off"
        />
        {searching ? <Loader2 className="absolute right-3 top-3 size-5 animate-spin text-white/45" /> : null}
        {suggestions.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                type="button"
                onClick={() => select(place)}
                className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#FF9500]" />
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {value ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <iframe
            src={`https://maps.google.com/maps?q=${encodeURIComponent(value)}&z=16&output=embed`}
            title={`Mapa de ${value}`}
            loading="lazy"
            className="h-40 w-full"
          />
        </div>
      ) : (
        <p className="text-xs text-white/40">Elegí una recomendación para confirmar la ubicación y ver el mapa.</p>
      )}
    </div>
  )
}

function CreateFields({
  form,
  idPrefix,
  borderless = false,
  step,
}: {
  form: ReturnType<typeof useCreateEvent>
  idPrefix: string
  borderless?: boolean
  step: number
}) {
  const duplicating = form.canDuplicate && form.fromSource
  const inputClassName = borderless
    ? "h-11 rounded-xl border-0 bg-white/[0.06] shadow-none focus-visible:border-transparent focus-visible:ring-0"
    : "h-11 rounded-xl border-zinc-800/50 bg-black"
  return (
    <>
      {step === 0 ? (
        <EventOperationModePicker
          value={form.operationMode}
          onChange={form.setOperationMode}
        />
      ) : null}
      {form.error ? (
        <p className="text-sm text-red-400" role="alert">
          {form.error}
        </p>
      ) : null}
      {step === 1 && form.canDuplicate && form.source ? (
        <button
          type="button"
          onClick={() => form.setFromSource(!form.fromSource)}
          className={
            "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors " +
            (borderless
              ? form.fromSource
                ? "bg-[#FF9500]/[0.08]"
                : "bg-white/[0.04] hover:bg-white/[0.07]"
              : form.fromSource
                ? "border border-[#FF9500]/40 bg-[#FF9500]/[0.08]"
                : "border border-zinc-800/50 bg-black hover:border-white/20")
          }
        >
          <span
            className={
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md " +
              (borderless
                ? form.fromSource
                  ? "bg-[#FF9500]"
                  : "bg-white/10"
                : form.fromSource
                  ? "border border-[#FF9500] bg-[#FF9500]"
                  : "border border-white/25")
            }
          >
            {form.fromSource ? <Check className="h-3.5 w-3.5 text-black" /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-white/90">
              Partir de: {form.source.name}
            </span>
            <span className="block text-[12px] text-white/40">
              Copia toda la configuración compatible con la modalidad elegida.
            </span>
          </span>
        </button>
      ) : null}
      {step === 1 ? (
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-name`}
          className="text-[13px] font-medium text-white/50"
        >
          Nombre{duplicating ? " (opcional)" : ""}
        </label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          required={!duplicating}
          className={inputClassName}
          placeholder={
            duplicating && form.source ? `${form.source.name} (copia)` : "Ej. Festival Noches Neón"
          }
        />
      </div>
      ) : null}
      {step === 2 ? (
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <label
            htmlFor={`${idPrefix}-date`}
            className="text-[13px] font-medium text-white/50"
          >
            Fecha
          </label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={form.date}
            onChange={(e) => form.setDate(e.target.value)}
            required
            className={inputClassName}
          />
        </div>
        <div className="w-28 space-y-2">
          <label
            htmlFor={`${idPrefix}-time`}
            className="text-[13px] font-medium text-white/50"
          >
            Hora (opcional)
          </label>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            value={form.time}
            onChange={(e) => form.setTime(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
      ) : null}
      {step === 3 ? (
      <>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-venue`}
          className="text-[13px] font-medium text-white/50"
        >
          Dirección textual (opcional)
        </label>
        <Input
          id={`${idPrefix}-venue`}
          value={form.venue}
          onChange={(e) => form.setVenue(e.target.value)}
          className={inputClassName}
          placeholder="Ej. Salón del Puerto"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-loc`}
          className="text-[13px] font-medium text-white/50"
        >
          Ubicación para el mapa (opcional)
        </label>
        <LocationPicker
          id={`${idPrefix}-loc`}
          value={form.location}
          onChange={form.setLocation}
          className={inputClassName}
        />
      </div>
      </>
      ) : null}
    </>
  )
}

function EventOperationModePicker({
  value,
  onChange,
}: {
  value: EventOperationMode | null
  onChange: (value: EventOperationMode) => void
}) {
  const icons = {
    TICKETS_ONLY: Ticket,
    TICKETS_AND_CONSUMPTIONS: Wine,
    FULL_OPERATION: Boxes,
  } satisfies Record<EventOperationMode, typeof Ticket>

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[13px] font-medium text-white/70">¿Qué vas a gestionar?</p>
        <p className="mt-0.5 text-[12px] text-white/35">
          Vas a ver solamente las herramientas que necesites.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {EVENT_OPERATION_MODE_OPTIONS.map((option) => {
          const Icon = icons[option.value]
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={
                "rounded-xl border px-3.5 py-3 text-left transition-colors " +
                (selected
                  ? "border-[#FF9500]/60 bg-[#FF9500]/[0.10]"
                  : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.06]")
              }
            >
              <Icon className={"mb-2 h-4 w-4 " + (selected ? "text-[#FF9500]" : "text-white/40")} />
              <span className="block text-[13px] font-semibold text-white/90">
                {option.label}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-white/40">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const CREATE_EVENT_STEPS = [
  {
    title: "¿Qué vas a gestionar?",
    description: "Elegí el tipo de evento para adaptar las herramientas de Crow.",
  },
  {
    title: "¿Cómo se llama tu evento?",
    description: "Podés cambiarlo más adelante si lo necesitás.",
  },
  {
    title: "¿Cuándo es?",
    description: "La hora es opcional.",
  },
  {
    title: "¿Dónde se realiza?",
    description: "Agregá el nombre del lugar y su ubicación en el mapa si la tenés.",
  },
] as const

function EventCreationWizard({
  form,
  idPrefix,
  borderless = false,
  onCancel,
}: {
  form: ReturnType<typeof useCreateEvent>
  idPrefix: string
  borderless?: boolean
  onCancel?: () => void
}) {
  const [step, setStep] = useState(0)
  const currentStep = CREATE_EVENT_STEPS[step]
  const isLastStep = step === CREATE_EVENT_STEPS.length - 1

  function goNext() {
    if (step === 0 && !form.operationMode) {
      form.setError("Elegí cómo vas a operar este evento")
      return
    }
    if (step === 1 && !form.name.trim() && !(form.canDuplicate && form.fromSource)) {
      form.setError("Escribí el nombre del evento")
      return
    }
    if (step === 2 && !form.date) {
      form.setError("Elegí una fecha")
      return
    }
    form.setError(null)
    setStep((current) => Math.min(current + 1, CREATE_EVENT_STEPS.length - 1))
  }

  function goBack() {
    form.setError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1.5" aria-label={`Paso ${step + 1} de ${CREATE_EVENT_STEPS.length}`}>
        {CREATE_EVENT_STEPS.map((item, index) => (
          <span
            key={item.title}
            className={`h-1 flex-1 rounded-full ${index <= step ? "bg-[#FF9500]" : "bg-white/[0.10]"}`}
          />
        ))}
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#FF9500]">
          Paso {step + 1} de {CREATE_EVENT_STEPS.length}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{currentStep.title}</h2>
        <p className="mt-1.5 text-sm text-white/45">{currentStep.description}</p>
      </div>

      <div className="flex flex-col gap-4">
        <CreateFields form={form} idPrefix={idPrefix} borderless={borderless} step={step} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {step > 0 ? (
            <Button type="button" variant="ghost" className="gap-1.5 rounded-xl" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
          ) : onCancel ? (
            <Button type="button" variant="ghost" className="rounded-xl" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
        </div>
        {isLastStep ? (
          <Button
            type="button"
            onClick={() => void form.submit()}
            disabled={form.loading}
            className="h-11 rounded-xl bg-[#FF9500] px-6 font-semibold text-white hover:bg-[#FF9500]/90"
          >
            {form.loading ? "Creando…" : "Crear evento"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={goNext}
            className="h-11 rounded-xl bg-[#FF9500] px-6 font-semibold text-white hover:bg-[#FF9500]/90"
          >
            Continuar
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function CreateHero({
  navigate,
  token,
  tenantId,
}: {
  navigate: ReturnType<typeof useNavigate>
  token: string | null
  tenantId: string | null
}) {
  const form = useCreateEvent(token, navigate)
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center">
      <MpConnectionCard tenantId={tenantId} token={token} className="mb-8 w-full max-w-3xl" />
      <div className="mb-8 w-full max-w-3xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Tu primer evento
        </h1>
        <p className="mt-3 text-[15px] text-white/40">
          Elegí cómo vas a operarlo. Crow adapta la configuración a esa modalidad.
        </p>
      </div>
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <EventCreationWizard form={form} idPrefix="hero" />
        <Button
          type="button"
          disabled={form.loading}
          className="hidden"
        >
          {form.loading ? "Creando…" : "Crear evento"}
        </Button>
      </div>
    </div>
  )
}

function CreateDialog({
  open,
  onOpenChange,
  token,
  navigate,
  source,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  token: string | null
  navigate: ReturnType<typeof useNavigate>
  source: ApiEvent | null
}) {
  const form = useCreateEvent(token, navigate, source)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl border-zinc-800/50 bg-black">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Nuevo evento</DialogTitle>
          <DialogDescription className="text-sm text-white/50">
            Elegí una modalidad y cargá los datos básicos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <EventCreationWizard
            key={open ? "open" : "closed"}
            form={form}
            idPrefix="dialog"
            borderless
            onCancel={() => onOpenChange(false)}
          />
          <DialogFooter className="hidden">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={form.loading}
              className="rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90"
            >
              {form.loading ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
