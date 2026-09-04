import { useCallback, useEffect, useState } from "react"
import { ReceiptText, Ticket, Wine } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"

type Props = {
  eventId: string
  refreshTrigger?: number
  supportsConsumptions?: boolean
}

function formatMoney(value: string): string {
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)
    : "—"
}

export function EventIncomeSummary({ eventId, refreshTrigger = 0, supportsConsumptions = true }: Props) {
  const token = useAuthStore((s) => s.token)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      setSummary(await apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, { method: "GET", token }))
    } catch (error) {
      setSummary(null)
      if (!(error instanceof ApiError)) throw error
    }
  }, [eventId, token])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, refreshTrigger])

  const items = [
    { label: "Ingresos totales", value: summary?.grossRevenue ?? "0", Icon: ReceiptText },
    { label: "Entradas", value: summary?.ticketRevenue ?? "0", Icon: Ticket },
    ...(supportsConsumptions
      ? [{ label: "Consumos", value: summary?.barSalesRevenue ?? "0", Icon: Wine }]
      : []),
  ]

  return (
    <section aria-labelledby="income-summary-title">
      <h2 id="income-summary-title" className="mb-4 text-lg font-semibold text-white">Resumen de ingresos</h2>
      <div className={`grid gap-3 ${supportsConsumptions ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {items.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-[13px] text-white/45"><Icon className="h-4 w-4" />{label}</div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-white">{formatMoney(value)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
