import { useEffect, useState } from "react"
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

type Props = {
  event: ApiEvent
  formId: string
  onUpdated: () => void | Promise<void>
  onStateChange: (state: { saving: boolean; hasSlugError: boolean }) => void
}

export function EventSalesConfig({ event, formId, onUpdated, onStateChange }: Props) {
  const token = useAuthStore((s) => s.token)
  const [ticketsLocal, setTicketsLocal] = useState("")
  const [consumptionsLocal, setConsumptionsLocal] = useState("")
  const [slug, setSlug] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTicketsLocal(toDatetimeLocalValue(event.ticketsAvailableFrom))
    setConsumptionsLocal(toDatetimeLocalValue(event.consumptionsAvailableFrom))
    setSlug(event.slug ?? "")
    setError(null)
  }, [
    event.id,
    event.ticketsAvailableFrom,
    event.consumptionsAvailableFrom,
    event.slug,
  ])

  const slugTrimmed = slug.trim()
  const slugError =
    slugTrimmed !== "" && !isValidSlug(slugTrimmed)
      ? "Solo minúsculas, números y guiones (ej: fiesta-verano)"
      : null

  useEffect(() => {
    onStateChange({ saving, hasSlugError: !!slugError })
  }, [saving, slugError, onStateChange])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || slugError) return
    setSaving(true)
    setError(null)
    try {
      const ticketsPayload =
        ticketsLocal.trim() === "" ? null : fromDatetimeLocalToIso(ticketsLocal)
      const consumptionsPayload =
        consumptionsLocal.trim() === ""
          ? null
          : fromDatetimeLocalToIso(consumptionsLocal)

      if (ticketsLocal.trim() !== "" && ticketsPayload === null) {
        setError("La fecha de entradas no es válida.")
        setSaving(false)
        return
      }
      if (consumptionsLocal.trim() !== "" && consumptionsPayload === null) {
        setError("La fecha de consumos no es válida.")
        setSaving(false)
        return
      }

      await apiFetch<{ event: ApiEvent }>(`/events/${event.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          ticketsAvailableFrom: ticketsPayload,
          consumptionsAvailableFrom: consumptionsPayload,
          slug: slugTrimmed === "" ? null : slugTrimmed,
        }),
      })
      await onUpdated()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar la configuración."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl bg-transparent py-5"
    >
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
            onBlur={() => setSlug((s) => slugify(s))}
            className="min-w-0 flex-1 bg-transparent text-lg text-foreground outline-none"
          />
        </div>
        {slugError ? (
          <p className="text-md text-red-500 dark:text-red-400">{slugError}</p>
        ) : slugTrimmed ? (
          <p className="text-md text-[#8E8E93] dark:text-[#98989D]">
            Link público:{" "}
            <span className="font-mono">crow.ar/{slugTrimmed}</span>
          </p>
        ) : (
          <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D]">
            Sin slug — el link usa el ID del evento.
          </p>
        )}
      </div>

      {error ? (
        <p className="mt-4 text-[13px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
