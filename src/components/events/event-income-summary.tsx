import { useCallback, useEffect, useState } from "react"
import { ChevronRight, ReceiptText, Ticket, Wine, type LucideIcon } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"

type IncomeTarget = "entradas" | "barra"

type Props = {
  eventId: string
  refreshTrigger?: number
  supportsConsumptions?: boolean
  /** Salta a la sección del evento que explica ese ingreso. */
  onNavigate?: (target: IncomeTarget) => void
  /** Acción secundaria junto al título (por ejemplo, ver todas las ventas). */
  action?: React.ReactNode
}

type IncomeRow = {
  key: string
  label: string
  value: string
  target: IncomeTarget
  Icon: LucideIcon
}

function formatMoney(value: string): string {
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)
    : "—"
}

export function EventIncomeSummary({ eventId, refreshTrigger = 0, supportsConsumptions = true, onNavigate, action }: Props) {
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

  const rows: IncomeRow[] = [
    { key: "entradas", label: "Entradas", value: summary?.ticketRevenue ?? "0", target: "entradas", Icon: Ticket },
    ...(supportsConsumptions
      ? [{ key: "consumos", label: "Consumos", value: summary?.barSalesRevenue ?? "0", target: "barra" as const, Icon: Wine }]
      : []),
  ]

  return (
    <section aria-labelledby="income-summary-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 lg:max-w-md">
        <h2 id="income-summary-title" className="text-lg font-semibold text-white">Ingresos</h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white/[0.02] lg:max-w-md">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
              <ReceiptText className="h-4 w-4 text-white/35" />
            </span>
            <p className="text-[13px] font-normal lowercase text-white/45">Ingresos totales</p>
          </div>
          <p className="mt-3 text-[34px] font-bold tabular-nums tracking-tight text-white">
            {formatMoney(summary?.grossRevenue ?? "0")}
          </p>
        </div>
        <div className="mt-4">
          {rows.map(({ key, label, value, target, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate?.(target)}
              className="flex w-full items-center gap-3 border-t border-white/[0.06] px-5 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]"
            >
              <Icon className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-white/45">{label}</span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-white/70">
                {formatMoney(value)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
