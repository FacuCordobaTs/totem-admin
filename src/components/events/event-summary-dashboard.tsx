import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import { Beer, Loader2, Lock, Ticket, TrendingUp, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF9500]" aria-hidden />
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

  const netNum = data.netProfit != null ? Number.parseFloat(data.netProfit) : NaN
  const netPositive = !Number.isNaN(netNum) && netNum >= 0

  return (
    <div className="space-y-10">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total revenue */}
        <article
          className={cn(
            "flex flex-col justify-between rounded-2xl border bg-background p-6 shadow-none transition-colors",
            "border-emerald-500/20 dark:border-emerald-500/25"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93] dark:text-[#98989D]">
                Ingresos totales
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {formatMoneyArs(data.grossRevenue)}
              </p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
            Entradas y ventas registradas en el evento.
          </p>
        </article>

        {/* Net profit */}
        <article
          className={cn(
            "flex flex-col justify-between rounded-2xl border bg-background p-6",
            data.canViewFinancials
              ? netPositive
                ? "border-[#FF9500]/25 dark:border-[#FF9500]/30"
                : "border-red-500/20 dark:border-red-500/25"
              : "border-zinc-200/50 dark:border-zinc-800/50"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93] dark:text-[#98989D]">
                Resultado neto
              </p>
              {data.canViewFinancials && data.netProfit != null ? (
                <p
                  className={cn(
                    "mt-3 truncate text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
                    netPositive ? "text-[#FF9500]" : "text-red-600 dark:text-red-400"
                  )}
                >
                  {formatMoneyArs(data.netProfit)}
                </p>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-[15px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Restringido</span>
                </div>
              )}
            </div>
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                data.canViewFinancials
                  ? netPositive
                    ? "bg-[#FF9500]/10 text-[#FF9500]"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-zinc-200/50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              )}
            >
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
            {data.canViewFinancials
              ? "Ingresos totales menos gastos del evento."
              : "Solo administradores y gerentes ven gastos y beneficio neto."}
          </p>
        </article>

        {/* Tickets */}
        <article className="flex flex-col justify-between rounded-2xl border border-zinc-200/50 bg-background p-6 dark:border-zinc-800/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93] dark:text-[#98989D]">
                Entradas
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {cap != null ? (
                  <>
                    {formatInt(sold)}
                    <span className="text-lg font-semibold text-[#8E8E93] dark:text-[#98989D]">
                      {" "}
                      / {formatInt(cap)}
                    </span>
                  </>
                ) : (
                  <>{formatInt(sold)}</>
                )}
              </p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-200/40 text-foreground dark:bg-zinc-800 dark:text-white">
              <Ticket className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-2 text-[13px] font-medium tabular-nums text-[#8E8E93] dark:text-[#98989D]">
            Ingresos por entradas: {formatMoneyArs(data.ticketRevenue)}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              <span>Puerta</span>
              <span className="tabular-nums">
                {formatInt(checked)} / {formatInt(sold)} ingresados
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-[#FF9500] transition-[width] duration-500"
                style={{ width: `${doorPct}%` }}
                role="progressbar"
                aria-valuenow={doorPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </article>

        {/* Bar / consumos */}
        <article className="flex flex-col justify-between rounded-2xl border border-zinc-200/50 bg-background p-6 dark:border-zinc-800/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8E8E93] dark:text-[#98989D]">
                Bar & consumos
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {formatInt(data.digitalConsumptionsGenerated)}
              </p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-200/40 text-foreground dark:bg-zinc-800 dark:text-white">
              <Beer className="h-5 w-5" aria-hidden />
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
            Consumiciones digitales emitidas (no canceladas).
          </p>
          <p className="mt-3 text-[13px] font-medium tabular-nums text-[#8E8E93] dark:text-[#98989D]">
            Ventas registradas: {formatMoneyArs(data.barSalesRevenue)}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              <span>Canje</span>
              <span className="tabular-nums">
                {formatInt(data.digitalConsumptionsRedeemed)} / {formatInt(data.digitalConsumptionsGenerated)}{" "}
                canjeados
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-500 transition-[width] duration-500 dark:bg-zinc-400"
                style={{
                  width: `${
                    data.digitalConsumptionsGenerated > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (data.digitalConsumptionsRedeemed / data.digitalConsumptionsGenerated) *
                              1000
                          ) / 10
                        )
                      : 0
                  }%`,
                }}
                role="progressbar"
                aria-valuenow={
                  data.digitalConsumptionsGenerated > 0
                    ? Math.round(
                        (data.digitalConsumptionsRedeemed / data.digitalConsumptionsGenerated) * 100
                      )
                    : 0
                }
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </article>
      </div>

      {data.canViewFinancials && data.totalExpenses != null ? (
        <p className="text-center text-[13px] text-[#8E8E93] dark:text-[#98989D]">
          Gastos operativos acumulados:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatMoneyArs(data.totalExpenses)}
          </span>
        </p>
      ) : null}
    </div>
  )
}
