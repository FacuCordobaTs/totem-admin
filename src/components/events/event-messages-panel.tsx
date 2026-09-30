import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react"
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
import { apiFetch, ApiError } from "@/lib/api"
import { eventSupportsConsumptions } from "@/lib/event-operation-mode"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"

type ReminderState =
  | "SENT"
  | "EVENT_CLOSED"
  | "DISABLED"
  | "MISSED"
  | "WAITING_SALE"
  | "SENDING"
  | "SCHEDULED"

/**
 * Espejo de `ReminderOverview` (backend `lib/whatsapp-reminder.ts`): respuesta de
 * `GET/PATCH /events/:id/whatsapp-reminder`. El estado, la hora de envío y los destinatarios los
 * calcula el backend con el mismo código con el que el runner manda: acá sólo se muestran.
 */
type ReminderOverview = {
  enabled: boolean
  leadMinutes: number
  leadLimits: { min: number; max: number }
  /** false = el WhatsApp de la plataforma no está configurado: no sale nada aunque esté activado. */
  whatsappAvailable: boolean
  state: ReminderState
  sentAt: string | null
  reference: { at: string; source: "doorsAt" | "date" }
  sendAt: string
  audience: { recipients: number; withoutPhone: number }
  message: {
    template: string
    /** Cuerpo con `{{1}}` (nombre de la persona) y `{{2}}` (nombre del evento). */
    bodyTemplate: string
    eventName: string
    buttonLabel: string
    url: string
  }
}

type ReminderPatch = { enabled?: boolean; leadMinutes?: number }

const LEAD_PRESETS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hora" },
  { minutes: 120, label: "2 horas" },
  { minutes: 180, label: "3 horas" },
  { minutes: 360, label: "6 horas" },
  { minutes: 720, label: "12 horas" },
  { minutes: 1440, label: "1 día" },
]

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const
type LeadUnit = keyof typeof UNIT_MINUTES
const UNIT_LABELS: Record<LeadUnit, string> = {
  minutes: "minutos",
  hours: "horas",
  days: "días",
}

const POLL_MS = 30_000

// Vista previa: la pantalla se puede ver pero no usar; el interruptor y el horario del envío quedan
// bloqueados. Pasar a `false` para habilitarlos.
const PREVIEW_ONLY = true

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const date = d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date} · ${time} hs`
}

function formatLead(minutes: number): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (minutes % 1440 === 0) return plural(minutes / 1440, "día", "días")
  if (minutes % 60 === 0) return plural(minutes / 60, "hora", "horas")
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return `${minutes} min`
}

/** Descompone un adelanto en la unidad más grande que lo divide exacto (para el campo "Otro"). */
function splitLead(minutes: number): { amount: string; unit: LeadUnit } {
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: "days" }
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: "hours" }
  return { amount: String(minutes), unit: "minutes" }
}

type Tone = "ok" | "live" | "warn" | "muted"

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-400",
  live: "bg-[#FF9500]",
  warn: "bg-amber-400",
  muted: "bg-white/25",
}

function describeState(data: ReminderOverview): { tone: Tone; title: string; detail: string } {
  switch (data.state) {
    case "SCHEDULED":
      return { tone: "ok", title: "Programado", detail: `Sale el ${formatDateTime(data.sendAt)}.` }
    case "SENDING":
      return { tone: "live", title: "Saliendo", detail: "Sale en el próximo minuto." }
    case "WAITING_SALE":
      return {
        tone: "warn",
        title: "Esperando que se abra la venta",
        detail:
          "El evento todavía está en borrador. El recordatorio sale recién cuando abras la venta, y sólo si todavía falta para el evento.",
      }
    case "DISABLED":
      return { tone: "muted", title: "Desactivado", detail: "No se envía ningún mensaje." }
    case "SENT":
      return {
        tone: "ok",
        title: "Enviado",
        detail: `Salió el ${data.sentAt ? formatDateTime(data.sentAt) : "—"}. No se vuelve a enviar.`,
      }
    case "MISSED":
      return {
        tone: "warn",
        title: "No salió",
        detail: "La hora del evento ya pasó y el recordatorio no salió. No se va a enviar.",
      }
    case "EVENT_CLOSED":
      return { tone: "muted", title: "Evento cerrado", detail: "Ya no se envían mensajes." }
  }
}

/** Estados en los que ya no hay nada que configurar: salió, se cerró el evento o pasó la hora. */
function isLocked(state: ReminderState): boolean {
  return state === "SENT" || state === "EVENT_CLOSED" || state === "MISSED"
}

/**
 * Cuerpo de referencia del mensaje: `{{1}}` es el nombre de cada persona (se marca como variable) y
 * `{{2}}` el nombre del evento.
 */
function MessageBody({ template, eventName }: { template: string; eventName: string }) {
  return (
    <p className="whitespace-pre-line text-[14px] leading-relaxed text-white/85">
      {template.split(/(\{\{\d+\}\})/g).map((part, index) => {
        if (part === "{{1}}") {
          return (
            <span key={index} className="rounded bg-[#FF9500]/15 px-1 font-medium text-[#FFB340]">
              nombre
            </span>
          )
        }
        if (part === "{{2}}") {
          return (
            <strong key={index} className="font-semibold text-white">
              {eventName}
            </strong>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </p>
  )
}

function Block({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/[0.06] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-white">{title}</h3>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-white/45">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function DateItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
      <dt className="text-[12px] font-medium text-white/40">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-white">{value}</dd>
      {hint ? <dd className="mt-0.5 text-[12px] text-white/35">{hint}</dd> : null}
    </div>
  )
}

function Chip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-[#FF9500] bg-[#FF9500]/15 text-[#FFB340]"
          : "border-white/[0.12] bg-transparent text-white/60 hover:border-white/25 hover:text-white"
      )}
    >
      {label}
    </button>
  )
}

/**
 * Bloque que va al final de la sección Entradas: estado del recordatorio y puerta a la pantalla
 * "Mensajes". Sólo lo ven quienes pueden configurarlo.
 */
export function EventMessagesEntry({
  enabled,
  onOpen,
}: {
  enabled: boolean
  onOpen: () => void
}) {
  const role = useAuthStore((s) => s.staff?.role)
  if (role !== "ADMIN" && role !== "MANAGER") return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/[0.06] py-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold text-white">Mensajes</h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.06] text-white/45"
            )}
          >
            {enabled ? "Recordatorio activado" : "Recordatorio desactivado"}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/45">
          Recordatorio por WhatsApp para quienes ya tienen entrada: cuándo sale, a cuántas personas y
          qué mensaje.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onOpen}
        className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]"
      >
        Configurar mensajes
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Pantalla "Mensajes" de un evento: interruptor y horario del recordatorio de WhatsApp, cuántas
 * personas lo reciben, qué mensaje con qué link, y las fechas del evento y de la venta de entradas.
 * Reemplaza el contenido de la sección Entradas; el botón para volver lo pone quien la monta.
 */
export function EventMessagesPanel({
  event,
  onEnabledChange,
}: {
  event: ApiEvent
  onEnabledChange?: (enabled: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const eventId = event.id
  const supportsConsumptions = eventSupportsConsumptions(event.operationMode ?? "FULL_OPERATION")

  const [data, setData] = useState<ReminderOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ patch: ReminderPatch; recipients: number } | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState<{ amount: string; unit: LeadUnit } | null>(null)
  const [customError, setCustomError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Descarta respuestas viejas: una actualización en vuelo no debe pisar lo que devolvió un guardado.
  const requestSeq = useRef(0)

  const fetchOverview = useCallback(
    () =>
      apiFetch<ReminderOverview>(`/events/${eventId}/whatsapp-reminder`, {
        method: "GET",
        token,
      }),
    [eventId, token]
  )

  useEffect(() => {
    if (!canManage || !token) return
    let cancelled = false
    fetchOverview()
      .then((next) => {
        if (cancelled) return
        setData(next)
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof ApiError ? err.message : "No se pudieron cargar los mensajes.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, token, fetchOverview])

  const refresh = useCallback(async (): Promise<boolean> => {
    const seq = ++requestSeq.current
    try {
      const next = await fetchOverview()
      if (seq === requestSeq.current) setData(next)
      return true
    } catch {
      return false
    }
  }, [fetchOverview])

  // La cifra de destinatarios y el estado cambian solos (se venden entradas, pasa el tiempo).
  useEffect(() => {
    if (!canManage || !token) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [canManage, token, refresh])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshFailed(!(await refresh()))
    setRefreshing(false)
  }

  async function handleRetry() {
    setLoading(true)
    setLoadError(null)
    try {
      setData(await fetchOverview())
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "No se pudieron cargar los mensajes.")
    } finally {
      setLoading(false)
    }
  }

  async function save(patch: ReminderPatch, confirmSend = false): Promise<void> {
    if (!token) return
    setSaving(true)
    setSaveError(null)
    try {
      const next = await apiFetch<ReminderOverview>(`/events/${eventId}/whatsapp-reminder`, {
        method: "PATCH",
        token,
        body: JSON.stringify(confirmSend ? { ...patch, confirmSend: true } : patch),
      })
      requestSeq.current += 1
      setData(next)
      setCustomDraft(null)
      setCustomError(null)
      if (patch.enabled !== undefined) onEnabledChange?.(next.enabled)
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.body?.code === "CONFIRM_IMMEDIATE_SEND"
      ) {
        // El cambio hace que el mensaje salga ya: el backend pide una confirmación explícita.
        setConfirm({ patch, recipients: Number(err.body.recipients) || 0 })
      } else {
        setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar el cambio.")
      }
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <p className="text-[15px] text-white/50">
        No tenés permiso para ver los mensajes de este evento.
      </p>
    )
  }

  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4 rounded-2xl bg-zinc-950 p-6 ring-1 ring-white/[0.06]">
        <p className="text-[15px] text-red-400" role="alert">
          {loadError ?? "No se pudieron cargar los mensajes."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleRetry()}
          className="border-white/[0.15] bg-transparent text-white hover:bg-white/[0.08]"
        >
          Reintentar
        </Button>
      </div>
    )
  }

  const status = describeState(data)
  const locked = isLocked(data.state)
  const controlsDisabled = locked || saving || PREVIEW_ONLY
  const referenceLabel =
    data.reference.source === "doorsAt" ? "la hora de puertas" : "la hora del evento"
  const isPreset = LEAD_PRESETS.some((preset) => preset.minutes === data.leadMinutes)
  const showCustom = customOpen || !isPreset
  const draft = customDraft ?? splitLead(data.leadMinutes)
  const { recipients, withoutPhone } = data.audience

  const applyCustom = () => {
    const amount = Number(draft.amount.replace(",", "."))
    const minutes = Math.round(amount * UNIT_MINUTES[draft.unit])
    if (!Number.isFinite(amount) || amount <= 0) {
      setCustomError("Escribí un número mayor a cero.")
      return
    }
    if (minutes < data.leadLimits.min || minutes > data.leadLimits.max) {
      setCustomError(
        `El adelanto tiene que estar entre ${formatLead(data.leadLimits.min)} y ${formatLead(data.leadLimits.max)}.`
      )
      return
    }
    setCustomError(null)
    if (minutes === data.leadMinutes) {
      setCustomDraft(null)
      return
    }
    void save({ leadMinutes: minutes })
  }

  return (
    <div className="space-y-6">
      {/* Interruptor y estado */}
      <section className="rounded-2xl bg-zinc-950 p-5 ring-1 ring-white/[0.06] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold text-white">Recordatorio por WhatsApp</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/45">
              Un mensaje a cada persona que ya tiene entrada, antes de que empiece el evento. Sale
              una sola vez.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[13px] font-semibold text-white/60">
              {data.enabled ? "Activado" : "Desactivado"}
            </span>
            <Switch
              checked={data.enabled}
              disabled={controlsDisabled}
              onCheckedChange={(checked) => void save({ enabled: checked })}
              aria-label="Recordatorio por WhatsApp"
            />
          </div>
        </div>
        {PREVIEW_ONLY ? (
          <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-white/60">
            Vista previa: por ahora sólo se puede ver cómo funciona. El interruptor y el horario del
            envío están bloqueados.
          </p>
        ) : null}
        <div
          className="mt-5 flex items-start gap-3 rounded-xl bg-white/[0.03] px-4 py-3"
          aria-live="polite"
        >
          <span
            className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[status.tone])}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white">{status.title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-white/55">{status.detail}</p>
          </div>
        </div>
        {!data.whatsappAvailable ? (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-300">
            El WhatsApp de la plataforma todavía no está habilitado: mientras tanto no sale ningún
            mensaje, aunque esté activado.
          </p>
        ) : null}
        {saveError ? (
          <p className="mt-3 text-[13px] text-red-400" role="alert">
            {saveError}
          </p>
        ) : null}
      </section>

      {/* Fechas configuradas (sólo lectura) */}
      <Block title="Fechas del evento" description="Las que tiene configuradas hoy.">
        <dl className="grid gap-3 sm:grid-cols-2">
          <DateItem label="Evento" value={formatDateTime(event.date)} />
          {event.doorsAt ? (
            <DateItem label="Puertas" value={formatDateTime(event.doorsAt)} />
          ) : null}
          <DateItem
            label="Venta de entradas"
            value={
              event.ticketsAvailableFrom
                ? `Desde el ${formatDateTime(event.ticketsAvailableFrom)}`
                : "Sin fecha programada"
            }
            hint={
              event.ticketsAvailableFrom
                ? "Se cambia en la sección Página."
                : "La compra no tiene una hora de apertura fijada."
            }
          />
          {supportsConsumptions ? (
            <DateItem
              label="Venta de consumiciones"
              value={
                event.consumptionsAvailableFrom
                  ? `Desde el ${formatDateTime(event.consumptionsAvailableFrom)}`
                  : "Sin fecha programada"
              }
              hint={
                event.consumptionsAvailableFrom
                  ? "Se cambia en la sección Página."
                  : "La compra no tiene una hora de apertura fijada."
              }
            />
          ) : null}
        </dl>
      </Block>

      {/* Cuándo sale */}
      <Block
        title="Cuándo se envía"
        description={`Cuánto antes de ${referenceLabel} sale el mensaje.`}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Adelanto del envío">
          {LEAD_PRESETS.map((preset) => (
            <Chip
              key={preset.minutes}
              label={preset.label}
              active={!showCustom && data.leadMinutes === preset.minutes}
              disabled={controlsDisabled}
              onClick={() => {
                setCustomOpen(false)
                setCustomDraft(null)
                setCustomError(null)
                if (preset.minutes !== data.leadMinutes) void save({ leadMinutes: preset.minutes })
              }}
            />
          ))}
          <Chip
            label="Otro"
            active={showCustom}
            disabled={controlsDisabled}
            onClick={() => {
              setCustomOpen(true)
              setCustomDraft(splitLead(data.leadMinutes))
            }}
          />
        </div>
        {showCustom ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={1}
                value={draft.amount}
                disabled={controlsDisabled}
                aria-label="Adelanto personalizado"
                onChange={(e) => setCustomDraft({ ...draft, amount: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  applyCustom()
                }}
                className="h-10 w-24 rounded-lg bg-white/[0.04] px-3 text-[15px] text-white outline-none ring-1 ring-white/[0.1] transition-shadow focus:ring-white/30 disabled:opacity-40"
              />
              <select
                value={draft.unit}
                disabled={controlsDisabled}
                aria-label="Unidad del adelanto"
                onChange={(e) => setCustomDraft({ ...draft, unit: e.target.value as LeadUnit })}
                className="h-10 rounded-lg bg-white/[0.04] px-3 text-[15px] text-white outline-none ring-1 ring-white/[0.1] transition-shadow focus:ring-white/30 disabled:opacity-40 [color-scheme:dark]"
              >
                {(Object.keys(UNIT_LABELS) as LeadUnit[]).map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={controlsDisabled}
                onClick={applyCustom}
                className="h-10 bg-[#FF9500] px-4 text-white hover:bg-[#FF9500]/90"
              >
                Aplicar
              </Button>
            </div>
            {customError ? (
              <p className="mt-2 text-[13px] text-red-400" role="alert">
                {customError}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="mt-5 text-[14px] leading-relaxed text-white/70">
          Sale <strong className="text-white">{formatLead(data.leadMinutes)} antes</strong> de{" "}
          {referenceLabel} ({formatDateTime(data.reference.at)}):{" "}
          <strong className="text-white">{formatDateTime(data.sendAt)}</strong>.
        </p>
        {data.reference.source === "date" ? (
          <p className="mt-1 text-[12px] text-white/35">
            El evento no tiene hora de puertas, así que se cuenta desde su fecha y hora.
          </p>
        ) : null}
      </Block>

      {/* A quién le llega */}
      <Block
        title="A quién le llega"
        description="Personas con entrada vigente y celular cargado. Una sola vez por persona, aunque tengan varias entradas."
        action={
          <div className="flex items-center gap-2">
            {refreshFailed ? (
              <span className="text-[12px] text-red-400" role="alert">
                No se pudo actualizar
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/75 disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              Actualizar
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-5xl font-extrabold tabular-nums tracking-tight text-white">
            {recipients}
          </span>
          <span className="pb-1.5 text-[15px] text-white/55">
            {locked
              ? recipients === 1
                ? "persona con entrada"
                : "personas con entrada"
              : recipients === 1
                ? "mensaje, con las entradas vendidas hasta ahora"
                : "mensajes, con las entradas vendidas hasta ahora"}
          </span>
        </div>
        {withoutPhone > 0 ? (
          <p className="mt-3 text-[13px] text-amber-300/80">
            {withoutPhone === 1
              ? "1 persona con entrada no tiene celular cargado: no recibe el mensaje."
              : `${withoutPhone} personas con entrada no tienen celular cargado: no reciben el mensaje.`}
          </p>
        ) : null}
        {data.enabled && !locked && recipients === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-amber-300/80">
            Todavía no hay nadie a quien mandárselo. Si a la hora de envío sigue sin haber personas
            con entrada y celular, el recordatorio se da por enviado igual y no vuelve a salir.
          </p>
        ) : null}
        {!locked ? (
          <p className="mt-2 text-[12px] text-white/35">
            El mensaje sale a quienes tengan entrada en el momento del envío; la cifra se actualiza
            con cada entrada que se vende.
          </p>
        ) : null}
      </Block>

      {/* Qué mensaje y con qué link */}
      <Block
        title="Qué mensaje reciben"
        description="Así le llega a cada persona. El nombre y el link se completan solos."
      >
        <div className="max-w-sm">
          <div className="rounded-2xl rounded-tl-md bg-white/[0.06] p-4 ring-1 ring-white/[0.08]">
            <MessageBody
              template={data.message.bodyTemplate}
              eventName={data.message.eventName}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] py-2.5 text-[14px] font-medium text-sky-300 ring-1 ring-white/[0.08]">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {data.message.buttonLabel}
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          <p className="text-[12px] font-medium text-white/40">Link del botón</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="break-all font-mono text-[14px] text-white/80">
              {data.message.url}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.message.url)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                } catch {
                  /* portapapeles no disponible */
                }
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-white/40 transition-colors hover:text-white/70"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <a
              href={data.message.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-white/40 transition-colors hover:text-white/70"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Abrir
            </a>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-white/35">
          Plantilla de WhatsApp «{data.message.template}». El texto exacto es el de la plantilla
          aprobada por Meta.
        </p>
      </Block>

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirm(null)
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Mandar el recordatorio ahora?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {confirm && confirm.recipients > 0
                ? `Con este cambio el mensaje sale en el próximo minuto a ${confirm.recipients} ${
                    confirm.recipients === 1 ? "persona" : "personas"
                  }. No se puede deshacer ni volver a enviar.`
                : "Con este cambio el mensaje sale en el próximo minuto, pero todavía no hay nadie con entrada y celular: el recordatorio quedaría como enviado sin llegarle a nadie y no volvería a salir."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={saving}
              className="border-zinc-700 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!confirm) return
                void save(confirm.patch, true).then(() => setConfirm(null))
              }}
              className="bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
            >
              {saving ? "Guardando…" : "Sí, enviar ahora"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
