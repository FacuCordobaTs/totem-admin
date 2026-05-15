import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import { Lock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

function formatMoney(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return "—"
  const isInt = Number.isInteger(n)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(n)
}

function formatInt(n: number): string {
  return n.toLocaleString("es-AR")
}

type Props = {
  eventId: string
  refreshTrigger?: number
}

export function EventSummaryDashboard({ eventId, refreshTrigger = 0 }: Props) {
  const token = useAuthStore((s) => s.token)
  const [data, setData] = useState<EventSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, {
        method: "GET",
        token,
      })
      setData(res)
    } catch (e) {
      setData(null)
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el resumen")
    } finally {
      setLoading(false)
    }
  }, [token, eventId, refreshTrigger])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-2xl ">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" aria-hidden />
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="rounded-2xl border border-red-200/60 bg-red-50/80 px-5 py-4 text-[15px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        {error ?? "Sin datos"}
      </p>
    )
  }

  const sold = data.ticketsSold
  const checked = data.ticketsCheckedIn
  const cap = data.ticketCapacity
  const doorPct = sold > 0 ? Math.min(100, Math.round((checked / sold) * 1000) / 10) : 0

  const canjePct =
    data.digitalConsumptionsGenerated > 0
      ? Math.min(
          100,
          Math.round(
            (data.digitalConsumptionsRedeemed / data.digitalConsumptionsGenerated) * 1000
          ) / 10
        )
      : 0

  const netNum = data.netProfit != null ? Number.parseFloat(data.netProfit) : NaN
  const netPositive = !Number.isNaN(netNum) && netNum >= 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {/* Ingresos totales */}
      <MetricCard label="ingresos totales">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {formatMoney(data.grossRevenue)}
        </p>
      </MetricCard>

      {/* Gastos operativos */}
      <MetricCard label="gastos operativos">
        {data.canViewFinancials && data.totalExpenses != null ? (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {formatMoney(data.totalExpenses)}
          </p>
        ) : (
          <RestrictedValue />
        )}
      </MetricCard>

      {/* Resultado neto */}
      <MetricCard label="resultado neto">
        {data.canViewFinancials && data.netProfit != null ? (
          <p
            className={cn(
              "text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
              netPositive ? "text-white" : "text-red-500"
            )}
          >
            {formatMoney(data.netProfit)}
          </p>
        ) : (
          <RestrictedValue />
        )}
      </MetricCard>

      {/* Entradas */}
      <MetricCard label="entradas">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {cap != null ? (
            <>
              {formatInt(sold)}
              <span className="text-lg font-medium text-[#8E8E93] dark:text-[#98989D]">
                {" "}
                / {formatInt(cap)}
              </span>
            </>
          ) : (
            formatInt(sold)
          )}
        </p>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            <span>Puerta</span>
            <span className="tabular-nums">
              {formatInt(checked)} / {formatInt(sold)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/50 transition-[width] duration-500"
              style={{ width: `${doorPct}%` }}
              role="progressbar"
              aria-valuenow={doorPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </MetricCard>

      {/* Bar & consumos */}
      <MetricCard label="bar & consumos">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {formatInt(data.digitalConsumptionsGenerated)}
        </p>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            <span>Canje</span>
            <span className="tabular-nums">
              {formatInt(data.digitalConsumptionsRedeemed)} /{" "}
              {formatInt(data.digitalConsumptionsGenerated)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/50 transition-[width] duration-500"
              style={{ width: `${canjePct}%` }}
              role="progressbar"
              aria-valuenow={canjePct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </MetricCard>
    </div>
  )
}

function MetricCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl  p-5">
      <p className="text-[12px] font-normal lowercase text-white/45">{label}</p>
      {children}
    </article>
  )
}

function RestrictedValue() {
  return (
    <div className="flex items-center gap-2 text-[15px] font-medium text-[#8E8E93] dark:text-[#98989D]">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      <span>Restringido</span>
    </div>
  )
}
