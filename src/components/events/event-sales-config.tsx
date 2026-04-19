import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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

type Props = {
  event: ApiEvent
  onUpdated: () => void | Promise<void>
}

export function EventSalesConfig({ event, onUpdated }: Props) {
  const token = useAuthStore((s) => s.token)
  const [ticketsLocal, setTicketsLocal] = useState("")
  const [consumptionsLocal, setConsumptionsLocal] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTicketsLocal(toDatetimeLocalValue(event.ticketsAvailableFrom))
    setConsumptionsLocal(toDatetimeLocalValue(event.consumptionsAvailableFrom))
    setError(null)
  }, [
    event.id,
    event.ticketsAvailableFrom,
    event.consumptionsAvailableFrom,
  ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
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
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-zinc-200/50 bg-transparent p-5 dark:border-zinc-800/50"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={`sales-tickets-${event.id}`}
            className="block text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]"
          >
            Inicio de Venta de Entradas
          </label>
          <input
            id={`sales-tickets-${event.id}`}
            type="datetime-local"
            value={ticketsLocal}
            onChange={(e) => setTicketsLocal(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-200/80 bg-white px-3 text-[15px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[#FF9500] dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D]">
            Vacío = disponible de inmediato (según el evento activo).
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`sales-consumptions-${event.id}`}
            className="block text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]"
          >
            Inicio de Venta de Barras (Consumiciones)
          </label>
          <input
            id={`sales-consumptions-${event.id}`}
            type="datetime-local"
            value={consumptionsLocal}
            onChange={(e) => setConsumptionsLocal(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-200/80 bg-white px-3 text-[15px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[#FF9500] dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D]">
            Vacío = disponible de inmediato.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-[13px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-10 min-w-[140px] rounded-xl bg-[#FF9500] px-5 text-[14px] font-semibold text-white shadow-none hover:bg-[#FF9500]/90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Guardando…
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
      </div>
    </form>
  )
}
