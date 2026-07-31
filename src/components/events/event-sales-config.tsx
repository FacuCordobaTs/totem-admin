import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"

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

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

type Fields = {
  ticketsLocal: string
  consumptionsLocal: string
  slug: string
  designType: "GLASS" | "MINIMAL"
}

type Props = {
  event: ApiEvent
  onUpdated: () => void | Promise<void>
}

/**
 * Config de la página pública. Sin botón de guardar (spec §0/§3.1): cada campo persiste
 * al perder el foco, con una confirmación visual mínima ("Guardado" efímero).
 */
export function EventSalesConfig({ event, onUpdated }: Props) {
  const token = useAuthStore((s) => s.token)
  const [ticketsLocal, setTicketsLocal] = useState("")
  const [consumptionsLocal, setConsumptionsLocal] = useState("")
  const [slug, setSlug] = useState("")
  const [designType, setDesignType] = useState<"GLASS" | "MINIMAL">("GLASS")
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /** Firma de lo último persistido, para saltear PATCH sin cambios reales. */
  const lastSavedRef = useRef<string>("")
  const savedTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const tickets = toDatetimeLocalValue(event.ticketsAvailableFrom)
    const consumptions = toDatetimeLocalValue(event.consumptionsAvailableFrom)
    const s = event.slug ?? ""
    const design = event.designType ?? "GLASS"
    setTicketsLocal(tickets)
    setConsumptionsLocal(consumptions)
    setSlug(s)
    setDesignType(design)
    setError(null)
    lastSavedRef.current = JSON.stringify([tickets, consumptions, s, design])
  }, [
    event.id,
    event.ticketsAvailableFrom,
    event.consumptionsAvailableFrom,
    event.slug,
    event.designType,
  ])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    }
  }, [])

  const slugTrimmed = slug.trim()
  const slugError =
    slugTrimmed !== "" && !isValidSlug(slugTrimmed)
      ? "Solo minúsculas, números y guiones (ej: fiesta-verano)"
      : null

  /** Persiste al blur. Lee los campos actuales; `override` permite empujar un cambio recién hecho. */
  const persist = useCallback(
    async (override?: Partial<Fields>) => {
      if (!token) return
      const tickets = override?.ticketsLocal ?? ticketsLocal
      const consumptions = override?.consumptionsLocal ?? consumptionsLocal
      const rawSlug = override?.slug ?? slug
      const design = override?.designType ?? designType

      const trimmed = rawSlug.trim()
      if (trimmed !== "" && !isValidSlug(trimmed)) return // el error ya se muestra

      const signature = JSON.stringify([tickets, consumptions, trimmed, design])
      if (signature === lastSavedRef.current) return // sin cambios reales

      const ticketsPayload = tickets.trim() === "" ? null : fromDatetimeLocalToIso(tickets)
      const consumptionsPayload =
        consumptions.trim() === "" ? null : fromDatetimeLocalToIso(consumptions)

      if (tickets.trim() !== "" && ticketsPayload === null) {
        setError("La fecha de entradas no es válida.")
        return
      }
      if (consumptions.trim() !== "" && consumptionsPayload === null) {
        setError("La fecha de consumos no es válida.")
        return
      }

      setSaving(true)
      setError(null)
      try {
        await apiFetch<{ event: ApiEvent }>(`/events/${event.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({
            ticketsAvailableFrom: ticketsPayload,
            consumptionsAvailableFrom: consumptionsPayload,
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
    [token, ticketsLocal, consumptionsLocal, slug, designType, event.id, onUpdated]
  )

  return (
    <div className="rounded-xl bg-transparent py-5">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={`sales-tickets-${event.id}`}
            className="block text-md font-medium text-[#98989D]"
          >
            Inicio de Venta de Entradas
          </label>
          <input
            id={`sales-tickets-${event.id}`}
            type="datetime-local"
            value={ticketsLocal}
            onChange={(e) => setTicketsLocal(e.target.value)}
            onBlur={() => void persist()}
            className="w-full rounded-lg p-3 text-[15px] text-foreground outline-none bg-zinc-950"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`sales-consumptions-${event.id}`}
            className="block text-md font-medium text-[#98989D]"
          >
            Inicio de Venta de Barras Consumiciones
          </label>
          <input
            id={`sales-consumptions-${event.id}`}
            type="datetime-local"
            value={consumptionsLocal}
            onChange={(e) => setConsumptionsLocal(e.target.value)}
            onBlur={() => void persist()}
            className="w-full rounded-lg p-3 text-[15px] text-foreground outline-none bg-zinc-950"
          />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <label
          htmlFor={`event-slug-${event.id}`}
          className="block text-md font-medium font-medium text-[#98989D]"
        >
          URL del evento
        </label>
        <div className="flex items-center gap-0 rounded-lg bg-zinc-950 py-3">
          <span className="select-none whitespace-nowrap pl-3 text-lg text-[#98989D]">
            crow.ar/
          </span>
          <input
            id={`event-slug-${event.id}`}
            type="text"
            value={slug}
            placeholder="mi-evento"
            maxLength={100}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            onBlur={() => {
              const cleaned = slugify(slug)
              setSlug(cleaned)
              void persist({ slug: cleaned })
            }}
            className="min-w-0 flex-1 bg-transparent text-lg text-foreground outline-none"
          />
        </div>
        {slugError ? (
          <p className="text-md text-red-500 dark:text-red-400">{slugError}</p>
        ) : slugTrimmed ? (
          <p className="flex items-center gap-2 text-md text-[#8E8E93] dark:text-[#98989D]">
            <span>
              Link público:{" "}
              <span className="font-mono">crow.ar/{slugTrimmed}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`https://crow.ar/${slugTrimmed}`)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                } catch {
                  /* clipboard unavailable */
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
          </p>
        ) : (
          <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D]">
            Sin slug — el link usa el ID del evento.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <label className="block text-md font-medium text-[#98989D]">
          Diseño de la página pública
        </label>
        <div className="grid grid-cols-2 gap-3">
          {([
            {
              value: "GLASS" as const,
              title: "Glassmorphism",
              desc: "Flyer a pantalla completa con capas translúcidas.",
            },
            {
              value: "MINIMAL" as const,
              title: "Minimalista",
              desc: "Diseño plano, elegante y sobrio.",
            },
          ]).map((opt) => {
            const active = designType === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (designType === opt.value) return
                  setDesignType(opt.value)
                  void persist({ designType: opt.value })
                }}
                aria-pressed={active}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-white/60 bg-white/[0.06]"
                    : "border-white/[0.12] bg-zinc-950 hover:border-white/25"
                }`}
              >
                <span
                  className="block text-[15px] font-semibold text-foreground"
                >
                  {opt.title}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-[#98989D]">
                  {opt.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Confirmación visual mínima (spec §0): sin toasts, un check efímero al persistir. */}
      <div className="mt-4 h-5 text-[13px]" aria-live="polite">
        {error ? (
          <p className="text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : saving ? (
          <span className="inline-flex items-center gap-1.5 text-[#98989D]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Guardando…
          </span>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Guardado
          </span>
        ) : null}
      </div>
    </div>
  )
}
