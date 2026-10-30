import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"
import { eventSupportsConsumptions } from "@/lib/event-operation-mode"
import { isValidSlug, slugify } from "@/lib/event-slug"
import { cn } from "@/lib/utils"

/** Converts an ISO instant from the API to `datetime-local` value in the browser timezone. */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (iso == null || iso === "") return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Interprets `datetime-local` as local civil time and returns a UTC ISO string for the API. */
function fromDatetimeLocalToIso(local: string): string | null {
  const t = local.trim()
  if (t === "") return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Fecha local de hoy en formato `YYYY-MM-DD` (para el input date). */
function todayLocalDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parte un valor `datetime-local` en [fecha, hora]. */
function splitDateTimeLocal(v: string): [string, string] {
  if (!v) return ["", ""]
  const [d, t = ""] = v.split("T")
  return [d ?? "", t.slice(0, 5)]
}

type Fields = {
  description: string
  venue: string
  location: string
  ticketsLocal: string
  ticketsCloseLocal: string
  consumptionsOnPage: boolean
  consumptionsOnAccessLink: boolean
  slug: string
  designType: "GLASS" | "MINIMAL"
}

type Props = {
  event: ApiEvent
  onUpdated: () => void | Promise<void>
  /** Muestra solo la configuración de URL/slug (paso previo antes de fechas y diseño). */
  onlySlug?: boolean
}

type TabId = "contenido" | "ventas" | "acceso"

const PAGE_TABS: { id: TabId; label: string }[] = [
  { id: "contenido", label: "Contenido" },
  { id: "ventas", label: "Ventas" },
  { id: "acceso", label: "Acceso" },
]

const DESIGN_OPTIONS = [
  {
    value: "GLASS" as const,
    title: "Glass",
    desc: "Flyer a pantalla completa con capas translúcidas.",
  },
  {
    value: "MINIMAL" as const,
    title: "Clásico",
    desc: "Diseño plano, elegante y sobrio.",
  },
]

/** Superficie de campo compartida: negra con un velo sutil, foco naranja. */
const fieldClass =
  "w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#FF9500]/40"

/**
 * Campo de fecha + hora usable: dos inputs nativos separados (calendario y reloj) en vez del
 * `datetime-local` combinado, con `color-scheme: dark` para que se vean bien sobre fondo oscuro.
 */
function DateTimeField({
  id,
  label,
  hint,
  value,
  onChange,
  onCommit,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  onCommit?: () => void
}) {
  const [datePart, timePart] = splitDateTimeLocal(value)

  function emit(nextDate: string, nextTime: string) {
    if (nextDate === "") {
      onChange("")
      return
    }
    onChange(`${nextDate}T${nextTime || "00:00"}`)
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-date`} className="block text-[14px] font-medium text-white/70">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${id}-date`}
          type="date"
          value={datePart}
          onChange={(e) => emit(e.target.value, timePart)}
          onBlur={onCommit}
          className={cn(fieldClass, "min-w-0 flex-1 [color-scheme:dark]")}
        />
        <input
          id={`${id}-time`}
          type="time"
          value={timePart}
          onChange={(e) => emit(datePart || todayLocalDate(), e.target.value)}
          onBlur={onCommit}
          aria-label={`${label} — hora`}
          className={cn(fieldClass, "w-32 [color-scheme:dark]")}
        />
      </div>
      {hint ? <p className="text-[12px] leading-relaxed text-white/35">{hint}</p> : null}
    </div>
  )
}

/**
 * Fecha y hora del evento. A diferencia del resto de la página se guarda con un botón: fecha y hora
 * son dos inputs, y guardar al salir de cada uno persistiría estados intermedios que el público ve y
 * que pueden disparar el recordatorio de WhatsApp.
 */
function EventDateField({ event, onUpdated }: Pick<Props, "event" | "onUpdated">) {
  const token = useAuthStore((s) => s.token)
  const saved = toDatetimeLocalValue(event.date)
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Personas a las que les saldría el recordatorio; `null` = no hay confirmación pendiente. */
  const [confirmRecipients, setConfirmRecipients] = useState<number | null>(null)

  useEffect(() => {
    setValue(saved)
    setError(null)
  }, [saved])

  async function save(confirmSend = false) {
    if (!token) return
    const date = fromDatetimeLocalToIso(value)
    if (date === null) {
      setError("Elegí una fecha válida.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch<{ event: ApiEvent }>(`/events/${event.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(confirmSend ? { date, confirmSend: true } : { date }),
      })
      setConfirmRecipients(null)
      // Recarga el evento: el encabezado y este campo pasan a mostrar la fecha guardada.
      await onUpdated()
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.body?.code === "CONFIRM_IMMEDIATE_SEND"
      ) {
        setConfirmRecipients(Number(err.body.recipients) || 0)
      } else {
        setConfirmRecipients(null)
        setError(err instanceof ApiError ? err.message : "No se pudo guardar la fecha.")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="sm:max-w-sm">
        <DateTimeField
          id={`event-date-${event.id}`}
          label="Fecha y hora del evento"
          hint="Es la que ve el público y la que usa el recordatorio de WhatsApp. No mueve las ventanas de venta ni los horarios de ingreso de las entradas."
          value={value}
          onChange={setValue}
        />
      </div>
      {value !== saved ? (
        <div className="flex items-center gap-2">
          <Button type="button" disabled={saving || value === ""} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar fecha"}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setValue(saved)}>
            Descartar
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="text-[12px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={confirmRecipients != null}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirmRecipients(null)
        }}
      >
        <AlertDialogContent className="border-0 bg-[#0a0a0a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Mandar el recordatorio ahora?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {confirmRecipients
                ? `Con esta fecha el recordatorio de WhatsApp sale en el próximo minuto a ${confirmRecipients} ${
                    confirmRecipients === 1 ? "persona" : "personas"
                  }. No se puede deshacer ni volver a enviar.`
                : "Con esta fecha el recordatorio de WhatsApp sale en el próximo minuto, pero todavía no hay nadie con entrada y celular: quedaría como enviado sin llegarle a nadie y no volvería a salir."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={saving} onClick={() => void save(true)}>
              {saving ? "Guardando…" : "Guardar y enviar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Interruptor de una preferencia booleana, sin contenedores anidados. */
function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-white">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
        className="mt-0.5 h-6 w-11 shrink-0 data-[state=checked]:bg-[#FF9500] data-[state=unchecked]:bg-white/[0.16]"
      />
    </div>
  )
}

/**
 * Config de la página pública. Sin botón de guardar (spec §0/§3.1): cada campo persiste
 * al perder el foco, con una confirmación visual mínima ("Guardado" efímero).
 *
 * La sección agrupa los campos en tres pestañas para que sólo se vea la tarea en curso:
 * contenido público, ventanas de venta y acceso del cliente. El link público queda siempre
 * visible porque es la identidad de la página.
 */
export function EventSalesConfig({ event, onUpdated, onlySlug = false }: Props) {
  const token = useAuthStore((s) => s.token)
  const [ticketsLocal, setTicketsLocal] = useState("")
  const [ticketsCloseLocal, setTicketsCloseLocal] = useState("")
  const [consumptionsOnPage, setConsumptionsOnPage] = useState(true)
  const [consumptionsOnAccessLink, setConsumptionsOnAccessLink] = useState(true)
  const [venue, setVenue] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [slug, setSlug] = useState("")
  const [designType, setDesignType] = useState<"GLASS" | "MINIMAL">("MINIMAL")
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedAccess, setCopiedAccess] = useState(false)
  const [tab, setTab] = useState<TabId>("contenido")
  const supportsConsumptions = eventSupportsConsumptions(
    event.operationMode ?? "FULL_OPERATION"
  )

  /** Firma de lo último persistido, para saltear PATCH sin cambios reales. */
  const lastSavedRef = useRef<string>("")
  const savedTimerRef = useRef<number | null>(null)
  const copiedTimerRef = useRef<number | null>(null)
  const copiedAccessTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const tickets = toDatetimeLocalValue(event.ticketsAvailableFrom)
    const ticketsClose = toDatetimeLocalValue(event.ticketsSalesClosedAt)
    const onPage = event.consumptionsOnPageEnabled ?? true
    const onAccessLink = event.consumptionsOnAccessLinkEnabled ?? true
    const desc = event.description ?? ""
    const s = event.slug ?? ""
    const design = event.designType ?? "MINIMAL"
    setTicketsLocal(tickets)
    setTicketsCloseLocal(ticketsClose)
    setConsumptionsOnPage(onPage)
    setConsumptionsOnAccessLink(onAccessLink)
    setVenue(event.venue ?? "")
    setLocation(event.location ?? "")
    setDescription(desc)
    setSlug(s)
    setDesignType(design)
    setError(null)
    lastSavedRef.current = JSON.stringify([desc, tickets, ticketsClose, onPage, onAccessLink, s, design, event.venue ?? "", event.location ?? ""])
  }, [
    event.id,
    event.description,
    event.venue,
    event.location,
    event.ticketsAvailableFrom,
    event.ticketsSalesClosedAt,
    event.consumptionsOnPageEnabled,
    event.consumptionsOnAccessLinkEnabled,
    event.slug,
    event.designType,
  ])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
      if (copiedAccessTimerRef.current) window.clearTimeout(copiedAccessTimerRef.current)
    }
  }, [])

  const slugTrimmed = slug.trim()
  // Sin slug el backend resuelve el evento por id, así que el link de acceso siempre existe.
  const accessPath = slugTrimmed || event.id
  const accessUrl = `https://crow.ar/${accessPath}/acceso`
  const slugError =
    slugTrimmed !== "" && !isValidSlug(slugTrimmed)
      ? "Solo minúsculas, números y guiones (ej: fiesta-verano)"
      : null

  /** Persiste al blur. Lee los campos actuales; `override` permite empujar un cambio recién hecho. */
  const persist = useCallback(
    async (override?: Partial<Fields>) => {
      if (!token) return
      const venueValue = (override?.venue ?? venue).trim()
      const locationValue = (override?.location ?? location).trim()
      const desc = (override?.description ?? description).trim()
      const tickets = override?.ticketsLocal ?? ticketsLocal
      const ticketsClose = override?.ticketsCloseLocal ?? ticketsCloseLocal
      const onPage = override?.consumptionsOnPage ?? consumptionsOnPage
      const onAccessLink =
        override?.consumptionsOnAccessLink ?? consumptionsOnAccessLink
      const rawSlug = override?.slug ?? slug
      const design = override?.designType ?? designType

      const trimmed = rawSlug.trim()
      if (trimmed !== "" && !isValidSlug(trimmed)) return // el error ya se muestra

      const signature = JSON.stringify([desc, tickets, ticketsClose, onPage, onAccessLink, trimmed, design, venueValue, locationValue])
      if (signature === lastSavedRef.current) return // sin cambios reales

      const ticketsPayload = tickets.trim() === "" ? null : fromDatetimeLocalToIso(tickets)
      const ticketsClosePayload =
        ticketsClose.trim() === "" ? null : fromDatetimeLocalToIso(ticketsClose)

      if (tickets.trim() !== "" && ticketsPayload === null) {
        setError("La fecha de entradas no es válida.")
        return
      }
      if (ticketsClose.trim() !== "" && ticketsClosePayload === null) {
        setError("La fecha de cierre de venta no es válida.")
        return
      }
      if (
        ticketsPayload !== null &&
        ticketsClosePayload !== null &&
        ticketsClosePayload <= ticketsPayload
      ) {
        setError("El cierre de venta debe ser posterior al inicio de venta.")
        return
      }

      setSaving(true)
      setError(null)
      try {
        await apiFetch<{ event: ApiEvent }>(`/events/${event.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({
            venue: venueValue || null,
            location: locationValue || null,
            description: desc === "" ? null : desc,
            ticketsAvailableFrom: ticketsPayload,
            ticketsSalesClosedAt: ticketsClosePayload,
            ...(supportsConsumptions
              ? {
                  consumptionsOnPageEnabled: onPage,
                  consumptionsOnAccessLinkEnabled: onAccessLink,
                }
              : {}),
            slug: trimmed === "" ? null : trimmed,
            designType: design,
          }),
        })
        lastSavedRef.current = signature
        setSavedAt(Date.now())
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
        savedTimerRef.current = window.setTimeout(() => setSavedAt(0), 2000)
        await onUpdated()
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "No se pudo guardar la configuración."
        )
      } finally {
        setSaving(false)
      }
    },
    [token, venue, location, description, ticketsLocal, ticketsCloseLocal, consumptionsOnPage, consumptionsOnAccessLink, slug, designType, event.id, onUpdated, supportsConsumptions]
  )

  const copy = useCallback(
    async (value: string, kind: "page" | "access") => {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        return
      }
      if (kind === "page") {
        setCopied(true)
        if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000)
      } else {
        setCopiedAccess(true)
        if (copiedAccessTimerRef.current) window.clearTimeout(copiedAccessTimerRef.current)
        copiedAccessTimerRef.current = window.setTimeout(() => setCopiedAccess(false), 2000)
      }
    },
    []
  )

  return (
    <div className="space-y-8">
      {/* Link público: identidad de la página, siempre visible. */}
      <section aria-labelledby={`event-link-title-${event.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              id={`event-link-title-${event.id}`}
              className="text-[15px] font-semibold text-white"
            >
              {onlySlug ? "Elegí la URL de tu página" : "Link público"}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/45">
              {onlySlug
                ? "Es el primer paso. Definí el link y después configurás contenido, ventas y diseño."
                : "La dirección que compartís con tu público."}
            </p>
          </div>
          <SaveStatus saving={saving} savedAt={savedAt} />
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2 focus-within:ring-2 focus-within:ring-[#FF9500]/40">
          <span className="select-none whitespace-nowrap text-[15px] text-white/35">
            crow.ar/
          </span>
          <input
            id={`event-slug-${event.id}`}
            type="text"
            value={slug}
            placeholder="mi-evento"
            maxLength={100}
            autoFocus={onlySlug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            onBlur={() => {
              const cleaned = slugify(slug)
              setSlug(cleaned)
              void persist({ slug: cleaned })
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              const cleaned = slugify(slug)
              setSlug(cleaned)
              void persist({ slug: cleaned })
            }}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-white outline-none placeholder:text-white/30"
          />
          {slugTrimmed ? (
            <button
              type="button"
              onClick={() => void copy(`https://crow.ar/${slugTrimmed}`, "page")}
              aria-label="Copiar link público"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
          ) : null}
        </div>

        {slugError ? (
          <p className="mt-2 text-[12px] text-red-400" role="alert">
            {slugError}
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-white/35">
            {slugTrimmed
              ? "El link público ya está activo."
              : "Sin slug — el link usa el ID del evento."}
          </p>
        )}
      </section>

      {!onlySlug ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)} className="gap-0">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-white/[0.04] p-1 sm:w-fit">
            {PAGE_TABS.map((option) => (
              <TabsTrigger
                key={option.id}
                value={option.id}
                className="h-11 flex-none rounded-lg px-3.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white/80 data-[state=active]:bg-white/[0.09] data-[state=active]:text-white data-[state=active]:shadow-none sm:h-9"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Contenido: lo que lee el público en la página. */}
          <TabsContent value="contenido" className="mt-6 space-y-8">
            <EventDateField event={event} onUpdated={onUpdated} />

            <div className="space-y-2">
              <label
                htmlFor={`event-description-${event.id}`}
                className="block text-[14px] font-medium text-white/70"
              >
                Descripción
              </label>
              <textarea
                id={`event-description-${event.id}`}
                value={description}
                placeholder={"Cont\u00e1 de qu\u00e9 se trata el evento: artistas, horarios, qu\u00e9 incluye\u2026"}
                maxLength={500}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => void persist()}
                className={cn(fieldClass, "resize-y leading-relaxed")}
              />
              <p className="text-[12px] text-white/35">
                Se muestra en la página pública, debajo del nombre del evento.{" "}
                {description.length}/500
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor={`event-venue-${event.id}`}
                  className="block text-[14px] font-medium text-white/70"
                >
                  Dirección textual
                </label>
                <input
                  id={`event-venue-${event.id}`}
                  value={venue}
                  maxLength={255}
                  placeholder="Ej. Salón del Puerto"
                  onChange={(e) => setVenue(e.target.value)}
                  onBlur={() => void persist()}
                  className={fieldClass}
                />
                <p className="text-[12px] text-white/35">
                  Opcional. Se muestra como texto en la página.
                </p>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor={`event-location-${event.id}`}
                  className="block text-[14px] font-medium text-white/70"
                >
                  Ubicación para el mapa
                </label>
                <input
                  id={`event-location-${event.id}`}
                  value={location}
                  maxLength={255}
                  placeholder="Dirección y ciudad, o coordenadas"
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={() => void persist()}
                  className={fieldClass}
                />
                <p className="text-[12px] text-white/35">
                  Opcional. Podés indicar el mapa sin completar la dirección textual.
                </p>
              </div>
            </div>

            {location.trim() ? (
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(location.trim())}&z=16&output=embed`}
                title="Vista previa de la ubicación del evento"
                loading="lazy"
                className="h-44 w-full rounded-xl"
              />
            ) : null}

            <div className="space-y-3">
              <div>
                <h4 className="text-[14px] font-medium text-white/70">
                  Diseño de la página pública
                </h4>
                <p className="mt-1 text-[12px] text-white/35">
                  Cómo se presenta el flyer y la información en el link público.
                </p>
              </div>
              <div
                role="group"
                aria-label="Diseño de la página pública"
                className="grid gap-3 sm:grid-cols-2"
              >
                {DESIGN_OPTIONS.map((option) => {
                  const active = designType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (designType === option.value) return
                        setDesignType(option.value)
                        void persist({ designType: option.value })
                      }}
                      className={cn(
                        "rounded-xl px-4 py-3.5 text-left transition-colors",
                        active
                          ? "bg-[#FF9500]/10"
                          : "bg-white/[0.03] hover:bg-white/[0.06]"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-white">
                          {option.title}
                        </span>
                        {active ? (
                          <Check className="h-4 w-4 shrink-0 text-[#FF9500]" aria-hidden />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-white/45">
                        {option.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          {/* Ventas: ventanas de venta anticipada, agrupadas en un solo lugar. */}
          <TabsContent value="ventas" className="mt-6 space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <DateTimeField
                id={`sales-tickets-${event.id}`}
                label="Inicio de venta de entradas"
                hint="Cuándo se abre la compra de entradas al público."
                value={ticketsLocal}
                onChange={setTicketsLocal}
                onCommit={() => void persist()}
              />
              <DateTimeField
                id={`sales-tickets-close-${event.id}`}
                label="Cierre de venta de entradas"
                hint="Pasada esta fecha no se pueden comprar más entradas. Vacío = sin cierre."
                value={ticketsCloseLocal}
                onChange={setTicketsCloseLocal}
                onCommit={() => void persist()}
              />
            </div>
            {supportsConsumptions ? (
              <div className="space-y-4">
                <ToggleRow
                  title="Venta de consumos en la página de evento"
                  description="Habilita la compra anticipada de barra en el link público del evento."
                  checked={consumptionsOnPage}
                  onCheckedChange={(checked) => {
                    setConsumptionsOnPage(checked)
                    void persist({ consumptionsOnPage: checked })
                  }}
                />
                <ToggleRow
                  title="Venta de consumos en el link de acceso"
                  description="Habilita la carta de barra en el link de acceso que se usa dentro del evento."
                  checked={consumptionsOnAccessLink}
                  onCheckedChange={(checked) => {
                    setConsumptionsOnAccessLink(checked)
                    void persist({ consumptionsOnAccessLink: checked })
                  }}
                />
              </div>
            ) : null}
            <p className="text-[12px] text-white/35">
              Los cambios se guardan al salir de cada campo.
            </p>
          </TabsContent>

          {/* Acceso: el link que se imprime para la barra y su QR. */}
          <TabsContent value="acceso" className="mt-6">
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-3">
                <div>
                  <h4 className="text-[14px] font-medium text-white/70">
                    Link de acceso del cliente
                  </h4>
                  <p className="mt-1 max-w-md text-[13px] leading-relaxed text-white/45">
                    Para la barra: el cliente lo escanea, entra con su DNI o celular y recibe
                    un código por WhatsApp.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 [overflow-wrap:anywhere]">
                    crow.ar/{accessPath}/acceso
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(accessUrl, "access")}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    {copiedAccess ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedAccess ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
              <div className="w-fit rounded-xl bg-white p-3">
                <QRCodeSVG value={accessUrl} size={144} level="M" includeMargin />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : null}

      {/* Confirmación visual mínima (spec §0): sin toasts, un check efímero al persistir. */}
      <div className="h-5 text-[13px]" aria-live="polite">
        {error ? (
          <p className="text-[12px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Estado de guardado compacto, siempre visible junto al título de la sección. */
function SaveStatus({ saving, savedAt }: { saving: boolean; savedAt: number }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-white/40">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Guardando…
      </span>
    )
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Guardado
      </span>
    )
  }
  return null
}
