import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
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
import { LocationPicker } from "@/components/events/location-picker"
import { EVENT_OPERATION_MODE_OPTIONS } from "@/lib/event-operation-mode"
import { isValidSlug, slugify } from "@/lib/event-slug"
import { ArrowLeft, Boxes, CalendarDays, Check, ChevronRight, Loader2, MapPin, Plus, Ticket, Trash2, Wine } from "lucide-react"
import type { ApiEvent, EventOperationMode } from "@/types/events"

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
  const navigate = useNavigate()
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
  const duplicateSource = sortedEvents[0] ?? null

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
            <CreateHero navigate={navigate} token={token} />
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

/* ── Creación ───────────────────────────────────────────────────────────────────────────── */

/**
 * Los tres campos de crear evento, listos para el empty state (spec §3: la puerta, no el texto).
 * Si `source` existe, se ofrece "Partir de: [último evento]" (default ON): en vez de crear en
 * blanco, se golpea `POST /events/:id/duplicate` (clona entradas, menú, precios y equipo) pisando
 * nombre/fecha/lugar. Duplicar es el camino por defecto del segundo evento en adelante (spec §5.2).
 *
 * El slug (`crow.ar/{slug}`) se autocompleta desde el nombre y queda editable en el mismo paso:
 * una vez que se escribe a mano, manda eso y el nombre deja de pisarlo.
 */
function useCreateEvent(
  token: string | null,
  navigate: ReturnType<typeof useNavigate>,
  source?: ApiEvent | null,
) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [date, setDate] = useState("") // YYYY-MM-DD
  const [time, setTime] = useState("") // HH:mm (opcional)
  const [venue, setVenue] = useState("")
  const [location, setLocation] = useState("")
  const [operationMode, setOperationMode] = useState<EventOperationMode | null>(null)
  const [fromSource, setFromSource] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDuplicate = source != null
  const duplicating = canDuplicate && fromSource
  // Al duplicar sin nombre el backend nombra "<origen> (copia)": el autocompletado sigue ese nombre.
  const autoSlug = slugify(
    name.trim() || (duplicating && source ? `${source.name} (copia)` : ""),
  )
  const effectiveSlug = slugEdited ? slug : autoSlug
  const slugError =
    effectiveSlug !== "" && !isValidSlug(effectiveSlug)
      ? "Solo minúsculas, números y guiones (ej: fiesta-verano)"
      : null

  /** Edición manual del slug: sólo los cambios reales cortan el autocompletado. */
  function updateSlug(next: string) {
    setSlugEdited(true)
    setSlug(next)
  }

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
    if (slugError) {
      setError(slugError)
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
          slug: effectiveSlug.trim() || undefined,
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
    slug: effectiveSlug,
    setSlug: updateSlug,
    slugError,
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
      <>
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
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefix}-slug`}
          className="text-[13px] font-medium text-white/50"
        >
          URL de tu página (opcional)
        </label>
        <div
          className={
            "flex items-center rounded-xl " +
            (borderless
              ? "h-11 bg-white/[0.06]"
              : "h-11 border border-zinc-800/50 bg-black transition-colors focus-within:border-white/25")
          }
        >
          <span className="select-none whitespace-nowrap pl-3 text-[15px] text-white/40">
            crow.ar/
          </span>
          <input
            id={`${idPrefix}-slug`}
            value={form.slug}
            maxLength={100}
            placeholder="mi-evento"
            onChange={(e) => form.setSlug(e.target.value.toLowerCase())}
            onBlur={() => {
              // Al salir se limpia lo que no sea válido; si no cambió nada, sigue el autocompletado.
              const cleaned = slugify(form.slug)
              if (cleaned !== form.slug) form.setSlug(cleaned)
            }}
            className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[15px] text-white outline-none placeholder:text-white/25"
          />
        </div>
        {form.slugError ? (
          <p className="text-[12px] text-red-400" role="alert">
            {form.slugError}
          </p>
        ) : form.slug ? (
          <p className="text-[12px] text-white/35">
            Link público: <span className="font-mono">crow.ar/{form.slug}</span>
          </p>
        ) : (
          <p className="text-[12px] text-white/35">
            Sin URL propia: el link usa el ID del evento.
          </p>
        )}
      </div>
      </>
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
    if (step === 1) {
      if (!form.name.trim() && !(form.canDuplicate && form.fromSource)) {
        form.setError("Escribí el nombre del evento")
        return
      }
      if (form.slugError) {
        form.setError(form.slugError)
        return
      }
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
}: {
  navigate: ReturnType<typeof useNavigate>
  token: string | null
}) {
  const form = useCreateEvent(token, navigate)
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center">
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
