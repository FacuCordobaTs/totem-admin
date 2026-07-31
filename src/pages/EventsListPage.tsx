import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
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
import { EventLivePanel } from "@/components/events/event-live-panel"
import { eventStatusLabel } from "@/lib/event-status"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import { Check, ChevronRight, Loader2, Plus } from "lucide-react"
import type { ApiEvent } from "@/types/events"

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
            <CreateHero navigate={navigate} token={token} />
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
    </div>
  )
}

/* ── Protagonista: pieza grande con señal vital ─────────────────────────────────────────── */

function ProtagonistCard({
  event,
  token,
  onOpen,
}: {
  event: ApiEvent
  token: string | null
  onOpen: () => void
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

  const subtitle = [formatEventDateShort(event.date), event.location]
    .filter(Boolean)
    .join(" · ")

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-3xl border border-white/[0.08] bg-white/[0.02] px-7 py-8 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
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
  )
}

/* ── Filas menores ──────────────────────────────────────────────────────────────────────── */

function MinorRow({ event, onOpen }: { event: ApiEvent; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 py-3.5 text-left transition-colors hover:opacity-80"
    >
      <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{event.name}</span>
      <span className="hidden shrink-0 text-[14px] text-white/40 sm:inline">
        {formatEventDateShort(event.date)}
      </span>
      <span className="shrink-0 text-[12px] uppercase tracking-wide text-white/30">
        {eventStatusLabel(event.status)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
    </button>
  )
}

function HistoryRow({
  event,
  token,
  onOpen,
}: {
  event: ApiEvent
  token: string | null
  onOpen: () => void
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
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 py-3.5 text-left transition-colors hover:opacity-80"
    >
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
  const [location, setLocation] = useState("")
  const [fromSource, setFromSource] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDuplicate = source != null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
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
          location: location.trim() || undefined,
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
    location,
    setLocation,
    fromSource,
    setFromSource,
    canDuplicate,
    source: source ?? null,
    loading,
    error,
    submit,
  }
}

function CreateFields({
  form,
  idPrefix,
}: {
  form: ReturnType<typeof useCreateEvent>
  idPrefix: string
}) {
  const duplicating = form.canDuplicate && form.fromSource
  return (
    <>
      {form.error ? (
        <p className="text-sm text-red-400" role="alert">
          {form.error}
        </p>
      ) : null}
      {form.canDuplicate && form.source ? (
        <button
          type="button"
          onClick={() => form.setFromSource(!form.fromSource)}
          className={
            "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors " +
            (form.fromSource
              ? "border-[#FF9500]/40 bg-[#FF9500]/[0.08]"
              : "border-zinc-800/50 bg-black hover:border-white/20")
          }
        >
          <span
            className={
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border " +
              (form.fromSource ? "border-[#FF9500] bg-[#FF9500]" : "border-white/25")
            }
          >
            {form.fromSource ? <Check className="h-3.5 w-3.5 text-black" /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-white/90">
              Partir de: {form.source.name}
            </span>
            <span className="block text-[12px] text-white/40">
              Copia entradas, menú, precios y equipo. Solo cambiás la fecha.
            </span>
          </span>
        </button>
      ) : null}
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
          className="h-11 rounded-xl border-zinc-800/50 bg-black"
          placeholder={
            duplicating && form.source ? `${form.source.name} (copia)` : "Ej. Festival Noches Neón"
          }
        />
      </div>
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
            className="h-11 rounded-xl border-zinc-800/50 bg-black"
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
            className="h-11 rounded-xl border-zinc-800/50 bg-black"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-loc`}
          className="text-[13px] font-medium text-white/50"
        >
          Lugar (opcional)
        </label>
        <Input
          id={`${idPrefix}-loc`}
          value={form.location}
          onChange={(e) => form.setLocation(e.target.value)}
          className="h-11 rounded-xl border-zinc-800/50 bg-black"
          placeholder="Venue o dirección"
        />
      </div>
    </>
  )
}

function CreateHero({
  navigate,
  token,
}: {
  navigate: ReturnType<typeof useNavigate>
  token: string | null
}) {
  const form = useCreateEvent(token, navigate)
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center">
      <div className="mb-8 w-full max-w-sm text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Tu primer evento
        </h1>
        <p className="mt-3 text-[15px] text-white/40">
          Ponele nombre y fecha. El resto lo configurás después.
        </p>
      </div>
      <form onSubmit={form.submit} className="flex w-full max-w-sm flex-col gap-4">
        <CreateFields form={form} idPrefix="hero" />
        <Button
          type="submit"
          disabled={form.loading}
          className="mt-2 h-11 rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90"
        >
          {form.loading ? "Creando…" : "Crear evento"}
        </Button>
      </form>
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
      <DialogContent className="max-w-md rounded-2xl border-zinc-800/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Nuevo evento</DialogTitle>
          <DialogDescription className="text-sm text-white/50">
            Nombre y fecha de inicio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <CreateFields form={form} idPrefix="dialog" />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={form.loading}
              className="rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90"
            >
              {form.loading ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
