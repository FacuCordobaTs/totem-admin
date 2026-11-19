import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router"
import {
  ArrowLeft,
  Boxes,
  Check,
  ChevronRight,
  Copy,
  FilePlus2,
  Ticket,
  Wine,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { EVENT_OPERATION_MODE_OPTIONS } from "@/lib/event-operation-mode"
import { isValidSlug, slugify } from "@/lib/event-slug"
import { LocationPicker } from "@/components/events/location-picker"
import type {
  ApiEvent,
  EventCopyPreview,
  EventCopySection,
  EventOperationMode,
} from "@/types/events"

type StartMode = "blank" | "copy"

type CopySectionOption = {
  value: EventCopySection
  label: string
  requiresConsumptions?: boolean
}

const COPY_SECTION_OPTIONS: CopySectionOption[] = [
  { value: "page", label: "Página" },
  { value: "tickets", label: "Entradas" },
  { value: "menu", label: "Menú", requiresConsumptions: true },
  { value: "bars", label: "Barras", requiresConsumptions: true },
  { value: "team", label: "Equipo" },
  { value: "transports", label: "Transporte" },
]

function formatSourceDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function sectionSummary(section: EventCopySection, preview: EventCopyPreview): string {
  const summary = preview.sections
  switch (section) {
    case "page":
      return "Diseño y contenido"
    case "tickets":
      return plural(summary.tickets.count, "tipo", "tipos")
    case "menu":
      return plural(summary.menu.count, "producto", "productos")
    case "bars":
      return `${plural(summary.bars.count, "barra", "barras")} · ${plural(summary.bars.products, "producto", "productos")}`
    case "team":
      return plural(summary.team.count, "persona", "personas")
    case "transports":
      return plural(summary.transports.count, "salida", "salidas")
  }
}

/**
 * Estado del alta de un evento. Cuando hay eventos anteriores, el flujo permite reutilizar
 * partes de uno de ellos en lugar de duplicarlo entero. `sections` es lo que efectivamente se
 * copia; `null` significa "todas las secciones disponibles" (el valor inicial y el de cada
 * cambio de evento de origen).
 */
function useCreateEvent(
  token: string | null,
  navigate: ReturnType<typeof useNavigate>,
  events: ApiEvent[],
) {
  const sortedSources = useMemo(
    () => [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events],
  )

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [date, setDate] = useState("") // YYYY-MM-DD
  const [time, setTime] = useState("") // HH:mm (opcional)
  const [venue, setVenue] = useState("")
  const [location, setLocation] = useState("")
  const [operationMode, setOperationMode] = useState<EventOperationMode | null>(null)
  const [startMode, setStartMode] = useState<StartMode>(sortedSources.length > 0 ? "copy" : "blank")
  const [sourceId, setSourceId] = useState(sortedSources[0]?.id ?? "")
  const [selectedSections, setSelectedSections] = useState<EventCopySection[] | null>(null)
  const [preview, setPreview] = useState<EventCopyPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRequestRef = useRef(0)

  const source = sortedSources.find((event) => event.id === sourceId) ?? null
  const supportsConsumptions = operationMode != null && operationMode !== "TICKETS_ONLY"
  const copying = startMode === "copy" && source != null

  const canCopy = sortedSources.length > 0
  // Al copiar sin nombre el backend nombra "<origen> (copia)": el autocompletado sigue ese nombre.
  const autoSlug = slugify(
    name.trim() || (copying && source ? `${source.name} (copia)` : ""),
  )
  const effectiveSlug = slugEdited ? slug : autoSlug
  const slugError =
    effectiveSlug !== "" && !isValidSlug(effectiveSlug)
      ? "Solo minúsculas, números y guiones (ej: fiesta-verano)"
      : null

  const loadPreview = useCallback(async () => {
    if (!token || startMode !== "copy" || !sourceId) {
      setPreview(null)
      setPreviewLoading(false)
      return
    }
    const requestId = ++previewRequestRef.current
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const data = await apiFetch<EventCopyPreview>(`/events/${sourceId}/copy-preview`, {
        method: "GET",
        token,
      })
      if (requestId !== previewRequestRef.current) return
      setPreview(data)
    } catch (err) {
      if (requestId !== previewRequestRef.current) return
      setPreview(null)
      setPreviewError(
        err instanceof ApiError ? err.message : "No se pudo leer el evento de origen.",
      )
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false)
    }
  }, [token, startMode, sourceId])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  // Al cambiar de origen se vuelve a la selección completa de lo disponible.
  useEffect(() => {
    setSelectedSections(null)
  }, [sourceId, startMode])

  const availableSections = useMemo<EventCopySection[]>(() => {
    if (!preview) return []
    return COPY_SECTION_OPTIONS.filter((option) => {
      if (option.requiresConsumptions && !supportsConsumptions) return false
      if (option.value === "page") return true
      const summary = preview.sections[option.value]
      return "count" in summary && summary.count > 0
    }).map((option) => option.value)
  }, [preview, supportsConsumptions])

  const effectiveSections = useMemo(() => {
    const chosen = selectedSections ?? availableSections
    const available = new Set(availableSections)
    return chosen.filter((section) => available.has(section))
  }, [selectedSections, availableSections])

  function toggleSection(section: EventCopySection) {
    setSelectedSections((current) => {
      const base = current ?? availableSections
      return base.includes(section)
        ? base.filter((item) => item !== section)
        : [...base, section]
    })
  }

  function selectAllSections() {
    setSelectedSections(availableSections)
  }

  function clearSections() {
    setSelectedSections([])
  }

  /** Edición manual del slug: sólo los cambios reales cortan el autocompletado. */
  function updateSlug(next: string) {
    setSlugEdited(true)
    setSlug(next)
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!token) return
    setError(null)
    if (!operationMode) {
      setError("Elegí cómo vas a operar este evento")
      return
    }
    if (!name.trim() && !copying) {
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
    if (copying && effectiveSections.length === 0) {
      setError("Elegí al menos una parte para copiar o empezá en blanco")
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
      const endpoint = copying ? `/events/${source!.id}/copy` : "/events"
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
          ...(copying ? { sections: effectiveSections } : {}),
        }),
      })
      navigate(`/eventos/${res.event.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el evento")
      setLoading(false)
    }
  }

  return {
    sources: sortedSources,
    canCopy,
    startMode,
    setStartMode,
    source,
    sourceId,
    setSourceId,
    preview,
    previewLoading,
    previewError,
    loadPreview,
    availableSections,
    effectiveSections,
    toggleSection,
    selectAllSections,
    clearSections,
    copying,
    supportsConsumptions,
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
    loading,
    error,
    setError,
    submit,
  }
}

type CreateForm = ReturnType<typeof useCreateEvent>

/* ── Campos por paso ─────────────────────────────────────────────────────────────────────── */

function StepFields({
  form,
  step,
  idPrefix,
}: {
  form: CreateForm
  step: string
  idPrefix: string
}) {
  const inputClassName =
    "h-11 rounded-xl border-0 bg-white/[0.06] shadow-none focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"

  if (step === "mode") {
    return <EventOperationModePicker value={form.operationMode} onChange={form.setOperationMode} />
  }

  if (step === "source") {
    return <CopySourceFields form={form} />
  }

  if (step === "identity") {
    return (
      <>
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-name`} className="text-[13px] font-medium text-white/50">
            Nombre{form.copying ? " (opcional)" : ""}
          </label>
          <Input
            id={`${idPrefix}-name`}
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            required={!form.copying}
            className={inputClassName}
            placeholder={
              form.copying && form.source ? `${form.source.name} (copia)` : "Ej. Festival Noches Neón"
            }
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-slug`} className="text-[13px] font-medium text-white/50">
            URL de tu página (opcional)
          </label>
          <div className="flex h-11 items-center rounded-xl bg-white/[0.06] transition-colors focus-within:ring-2 focus-within:ring-[#FF9500]/40">
            <span className="select-none whitespace-nowrap pl-3 text-[15px] text-white/40">
              crow.ar/
            </span>
            <input
              id={`${idPrefix}-slug`}
              value={form.slug}
              maxLength={100}
              placeholder="mi-evento"
              onChange={(event) => form.setSlug(event.target.value.toLowerCase())}
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
    )
  }

  if (step === "schedule") {
    return (
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <label htmlFor={`${idPrefix}-date`} className="text-[13px] font-medium text-white/50">
            Fecha
          </label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={form.date}
            onChange={(event) => form.setDate(event.target.value)}
            required
            className={inputClassName}
          />
        </div>
        <div className="w-28 space-y-2">
          <label htmlFor={`${idPrefix}-time`} className="text-[13px] font-medium text-white/50">
            Hora (opcional)
          </label>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            value={form.time}
            onChange={(event) => form.setTime(event.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-venue`} className="text-[13px] font-medium text-white/50">
          Dirección textual (opcional)
        </label>
        <Input
          id={`${idPrefix}-venue`}
          value={form.venue}
          onChange={(event) => form.setVenue(event.target.value)}
          className={inputClassName}
          placeholder="Ej. Salón del Puerto"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-loc`} className="text-[13px] font-medium text-white/50">
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
            className={cn(
              "rounded-xl px-3.5 py-3 text-left transition-colors",
              selected
                ? "bg-[#FF9500]/[0.10]"
                : "bg-white/[0.03] hover:bg-white/[0.06]",
            )}
          >
            <Icon className={cn("mb-2 h-4 w-4", selected ? "text-[#FF9500]" : "text-white/40")} />
            <span className="block text-[13px] font-semibold text-white/90">{option.label}</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-white/40">
              {option.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Punto de partida: en blanco o copiar partes de otro evento ──────────────────────────── */

function CopySourceFields({ form }: { form: CreateForm }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Punto de partida">
        <StartModeCard
          selected={form.startMode === "blank"}
          onSelect={() => form.setStartMode("blank")}
          Icon={FilePlus2}
          title="En blanco"
          description="Sin datos heredados."
        />
        <StartModeCard
          selected={form.startMode === "copy"}
          onSelect={() => form.setStartMode("copy")}
          Icon={Copy}
          title="Copiar de un evento"
          description="Elegís qué partes reutilizar."
        />
      </div>

      {form.startMode === "blank" ? (
        <p className="text-[12px] leading-relaxed text-white/35">
          El evento nuevo empieza sin equipo asignado ni barras. Podés sumarlos cuando quieras.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="create-event-source"
              className="text-[13px] font-medium text-white/50"
            >
              Evento de origen
            </label>
            <Select
              value={form.sourceId}
              onValueChange={(value) => form.setSourceId(value)}
            >
              <SelectTrigger
                id="create-event-source"
                className="h-11 w-full rounded-xl border-0 bg-white/[0.06] px-3 text-[14px] text-white shadow-none"
              >
                <SelectValue placeholder="Elegí un evento" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {form.sources.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name} · {formatSourceDate(event.date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CopySectionPicker form={form} />
        </div>
      )}
    </div>
  )
}

function StartModeCard({
  selected,
  onSelect,
  Icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  Icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors",
        selected
          ? "bg-[#FF9500]/[0.10]"
          : "bg-white/[0.03] hover:bg-white/[0.06]",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-[#FF9500]" : "text-white/40")} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white/90">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-white/40">{description}</span>
      </span>
    </button>
  )
}

function CopySectionPicker({ form }: { form: CreateForm }) {
  if (form.previewLoading) {
    return (
      <div className="space-y-2" role="status" aria-label="Leyendo el evento de origen">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-12 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none"
          />
        ))}
      </div>
    )
  }

  if (form.previewError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-[13px] text-rose-300">
          {form.previewError}
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void form.loadPreview()}
          className="h-9 rounded-xl bg-white/[0.06] px-3 text-[13px] text-white/80 hover:bg-white/[0.1] hover:text-white"
        >
          Volver a intentar
        </Button>
      </div>
    )
  }

  if (!form.preview) return null
  const preview = form.preview

  if (form.availableSections.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-white/45">
        Este evento no tiene configuración compatible para copiar. Empezá en blanco.
      </p>
    )
  }

  const selectedCount = form.effectiveSections.length
  const allSelected = selectedCount === form.availableSections.length

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-white/50">Qué copiar</p>
        <button
          type="button"
          onClick={allSelected ? form.clearSections : form.selectAllSections}
          className="rounded-lg text-[12px] font-medium text-[#FFB340] transition-colors hover:text-[#FFD08A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9500]"
        >
          {allSelected ? "Quitar todo" : "Seleccionar todo"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
        {form.availableSections.map((section, index) => {
          const option = COPY_SECTION_OPTIONS.find((item) => item.value === section)
          if (!option) return null
          const selected = form.effectiveSections.includes(section)
          return (
            <button
              key={section}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => form.toggleSection(section)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]",
                index > 0 && "border-t border-white/[0.06]",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
                  selected ? "bg-[#FF9500] text-black" : "bg-white/[0.08]",
                )}
              >
                {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white/90">
                {option.label}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-white/40">
                {sectionSummary(section, preview)}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[12px] leading-relaxed text-white/35">
        Se copia la configuración elegida. Ventas, entradas emitidas, cortesías, stock, compras y
        gastos nunca pasan al evento nuevo.
      </p>
      {!form.supportsConsumptions && preview.sections.menu.count + preview.sections.bars.count > 0 ? (
        <p className="text-[12px] leading-relaxed text-[#FFB340]/80">
          El menú y las barras no se copian en eventos solo de entradas.
        </p>
      ) : null}
    </div>
  )
}

/* ── Wizard ──────────────────────────────────────────────────────────────────────────────── */

type WizardStep = "mode" | "source" | "identity" | "schedule" | "place"

const STEP_COPY: Record<
  Exclude<WizardStep, "source">,
  { title: string; description: string }
> = {
  mode: {
    title: "¿Qué vas a gestionar?",
    description: "Elegí el tipo de evento para adaptar las herramientas de Crow.",
  },
  identity: {
    title: "¿Cómo se llama tu evento?",
    description: "Podés cambiarlo más adelante si lo necesitás.",
  },
  schedule: {
    title: "¿Cuándo es?",
    description: "La hora es opcional.",
  },
  place: {
    title: "¿Dónde se realiza?",
    description: "Agregá el nombre del lugar y su ubicación en el mapa si la tenés.",
  },
}

function CreateEventWizard({
  form,
  idPrefix,
  onCancel,
  stickyFooter = false,
}: {
  form: CreateForm
  idPrefix: string
  onCancel?: () => void
  stickyFooter?: boolean
}) {
  const steps = useMemo<WizardStep[]>(
    () =>
      form.canCopy
        ? ["mode", "source", "identity", "schedule", "place"]
        : ["mode", "identity", "schedule", "place"],
    [form.canCopy],
  )
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const isLastStep = stepIndex === steps.length - 1
  const currentStep =
    step === "source"
      ? {
          title: "¿Empezar en blanco o copiar?",
          description: "Reutilizá partes de un evento anterior sin arrastrar sus hechos.",
        }
      : STEP_COPY[step]

  function goNext() {
    if (step === "mode" && !form.operationMode) {
      form.setError("Elegí cómo vas a operar este evento")
      return
    }
    if (step === "source" && form.startMode === "copy") {
      if (!form.source) {
        form.setError("Elegí el evento de origen")
        return
      }
      if (!form.preview) {
        form.setError("Esperá a que cargue el evento de origen")
        return
      }
      if (form.effectiveSections.length === 0) {
        form.setError("Elegí al menos una parte para copiar o empezá en blanco")
        return
      }
    }
    if (step === "identity") {
      if (!form.name.trim() && !form.copying) {
        form.setError("Escribí el nombre del evento")
        return
      }
      if (form.slugError) {
        form.setError(form.slugError)
        return
      }
    }
    if (step === "schedule" && !form.date) {
      form.setError("Elegí una fecha")
      return
    }
    form.setError(null)
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  function goBack() {
    form.setError(null)
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1.5" aria-label={`Paso ${stepIndex + 1} de ${steps.length}`}>
        {steps.map((item, index) => (
          <span
            key={item}
            className={cn(
              "h-1 flex-1 rounded-full",
              index <= stepIndex ? "bg-[#FF9500]" : "bg-white/[0.10]",
            )}
          />
        ))}
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#FF9500]">
          Paso {stepIndex + 1} de {steps.length}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{currentStep.title}</h2>
        <p className="mt-1.5 text-sm text-white/45">{currentStep.description}</p>
      </div>

      <div className="flex flex-col gap-4">
        {form.error ? (
          <p className="text-sm text-red-400" role="alert">
            {form.error}
          </p>
        ) : null}
        <StepFields form={form} step={step} idPrefix={idPrefix} />
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3",
          stickyFooter &&
            "sticky bottom-0 z-10 -mx-6 border-t border-white/[0.06] bg-black px-6 pb-1 pt-4",
        )}
      >
        <div>
          {stepIndex > 0 ? (
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
            className="h-11 rounded-xl bg-[#FF9500] px-6 font-semibold text-black hover:bg-[#FFAD33]"
          >
            {form.loading ? "Creando…" : "Crear evento"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={goNext}
            disabled={step === "source" && form.startMode === "copy" && form.previewLoading}
            className="h-11 rounded-xl bg-[#FF9500] px-6 font-semibold text-black hover:bg-[#FFAD33]"
          >
            Continuar
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── Superficies de alta ─────────────────────────────────────────────────────────────────── */

export function CreateEventHero({
  token,
  events,
}: {
  token: string | null
  events: ApiEvent[]
}) {
  const navigate = useNavigate()
  const form = useCreateEvent(token, navigate, events)
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
      <div className="w-full max-w-3xl">
        <CreateEventWizard form={form} idPrefix="hero" />
      </div>
    </div>
  )
}

export function CreateEventDialog({
  open,
  onOpenChange,
  token,
  events,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  token: string | null
  events: ApiEvent[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-black sm:max-w-3xl!">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Nuevo evento</DialogTitle>
          <DialogDescription className="text-sm text-white/50">
            Cargá los datos básicos. Si querés, reutilizá la configuración de otro evento.
          </DialogDescription>
        </DialogHeader>
        {/* El contenido se monta con el diálogo: cada apertura empieza de cero. */}
        {open ? (
          <CreateEventDialogBody token={token} events={events} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CreateEventDialogBody({
  token,
  events,
  onClose,
}: {
  token: string | null
  events: ApiEvent[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const form = useCreateEvent(token, navigate, events)
  return (
    <CreateEventWizard form={form} idPrefix="dialog" onCancel={onClose} stickyFooter />
  )
}
