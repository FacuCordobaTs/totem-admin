import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import type { ApiTicketType } from "@/components/events/ticket-types"

type Props = {
  eventId: string
  refreshTrigger?: number
}

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

function formatMoneyShort(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—"
  const isInt = Number.isInteger(value)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(value)
}

/**
 * Spec §4.6 — Proyección (antes del evento): ingreso potencial por entradas (tipos × precio ×
 * cupo), costos cargados hasta ahora y punto de equilibrio ("cubrís costos vendiendo N").
 * Los costos salen de `/summary.totalExpenses` (incluye mercadería por compras + operativos);
 * el ingreso potencial, de `/ticket-types`.
 */
export function EventFinanceProjection({ eventId, refreshTrigger = 0 }: Props) {
  const token = useAuthStore((s) => s.token)
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)
  const [types, setTypes] = useState<ApiTicketType[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [sum, tt] = await Promise.all([
        apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, {
          method: "GET",
          token,
        }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
          method: "GET",
          token,
        }),
      ])
      setSummary(sum)
      setTypes(tt.ticketTypes)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      setSummary(null)
      setTypes(null)
    } finally {
      setLoading(false)
    }
  }, [token, eventId, refreshTrigger])

  useEffect(() => {
    void load()
  }, [load])

  const projection = useMemo(() => {
    if (!types) return null
    let potentialIncome = 0
    let totalCapacity = 0
    let hasUnlimited = false
    let priceSum = 0
    for (const t of types) {
      const price = Number.parseFloat(t.price)
      if (!Number.isNaN(price)) priceSum += price
      if (t.stockLimit == null) {
        hasUnlimited = true
        continue
      }
      if (!Number.isNaN(price)) {
        potentialIncome += price * t.stockLimit
        totalCapacity += t.stockLimit
      }
    }
    // Precio representativo para el punto de equilibrio: promedio ponderado por cupo si hay
    // cupos; si todo es ilimitado, promedio simple de precios de tipo.
    const avgPrice =
      totalCapacity > 0
        ? potentialIncome / totalCapacity
        : types.length > 0
          ? priceSum / types.length
          : 0
    return {
      hasTypes: types.length > 0,
      potentialIncome,
      hasUnlimited,
      avgPrice,
    }
  }, [types])

  if (loading) {
    return (
      <div className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />
    )
  }

  if (!projection || !projection.hasTypes) {
    return (
      <p className="rounded-2xl border border-white/[0.06] px-5 py-6 text-[15px] text-white/45">
        Cargá al menos un tipo de entrada para ver la proyección de ingresos.
      </p>
    )
  }

  const canViewCosts = summary?.canViewFinancials ?? false
  const costs =
    canViewCosts && summary?.totalExpenses != null
      ? Number.parseFloat(summary.totalExpenses)
      : null
  const breakEven =
    costs != null && costs > 0 && projection.avgPrice > 0
      ? Math.ceil(costs / projection.avgPrice)
      : null

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.06] px-5 py-5">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <div>
          <p className="text-[13px] text-white/45">Ingreso potencial</p>
          <p className="mt-0.5 text-[28px] font-bold tabular-nums tracking-tight text-white">
            {formatMoneyShort(projection.potentialIncome)}
          </p>
          <p className="mt-0.5 text-[12px] text-white/35">
            entradas × precio × cupo
            {projection.hasUnlimited ? " · algún tipo es sin cupo" : ""}
          </p>
        </div>
        {canViewCosts ? (
          <div>
            <p className="text-[13px] text-white/45">Costos cargados</p>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums tracking-tight text-white">
              {formatMoneyShort(costs)}
            </p>
            <p className="mt-0.5 text-[12px] text-white/35">
              operativos + mercadería comprada
            </p>
          </div>
        ) : null}
      </div>

      {canViewCosts ? (
        <p className="border-t border-white/[0.06] pt-4 text-[15px] text-white/70">
          {costs == null || costs === 0 ? (
            "Todavía no cargaste costos."
          ) : breakEven != null ? (
            <>
              Cubrís costos vendiendo{" "}
              <span className="font-semibold text-white">~{breakEven}</span> entradas.
            </>
          ) : (
            "Definí precios de entrada para calcular el punto de equilibrio."
          )}
        </p>
      ) : null}
    </div>
  )
}
