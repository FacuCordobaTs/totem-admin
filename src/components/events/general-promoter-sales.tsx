import { useCallback, useEffect, useMemo, useState } from "react"
import { Ticket, Wallet } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventPromoterSalesResponse, EventPromoterSalesRow } from "@/types/event-dashboard"

/** Pesos sin centavos cuando el monto es entero (los precios de entrada lo son casi siempre). */
function money(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (!Number.isFinite(n)) return "—"
  const isInt = Number.isInteger(n)
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(n)
}

function int(n: number): string {
  return n.toLocaleString("es-AR")
}

function ticketsWord(n: number): string {
  return n === 1 ? "entrada" : "entradas"
}

/** Porcentaje entero; lo que no llega a 1% pero existe se muestra como "<1%" en vez de 0%. */
function shareLabel(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%"
  const pct = Math.round((part / total) * 100)
  if (pct === 0) return "<1%"
  return `${pct}%`
}

type Props = {
  eventId: string
  /** Cambia cuando la cartera cambió (alta de un promotor) para volver a pedir los números. */
  refreshToken?: number
}

/**
 * Tablero del promotor general dentro del evento: entradas vendidas y recaudado de su cartera,
 * por promotor y en total. Los datos salen de `GET /events/:id/promoter-sales`, que para este rol
 * ya viene acotado a sus propios promotores (`promoters.owner_staff_id`).
 *
 * El reparto se lee con una barra de participación por promotor: en el celular la fila apila
 * nombre, monto y barra; desde `sm` los totales pasan a dos columnas.
 */
export function GeneralPromoterSalesPanel({ eventId, refreshToken = 0 }: Props) {
  const token = useAuthStore((s) => s.token)
  const [rows, setRows] = useState<EventPromoterSalesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<EventPromoterSalesResponse>(
        `/events/${eventId}/promoter-sales`,
        { method: "GET", token }
      )
      setRows(data.promoters)
    } catch (err) {
      setRows([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las ventas")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const totals = useMemo(() => {
    const ticketRevenue = rows.reduce((sum, row) => sum + Number.parseFloat(row.ticketRevenue), 0)
    return {
      ticketsCount: rows.reduce((sum, row) => sum + row.ticketsCount, 0),
      ticketRevenue,
      sellingPromoters: rows.filter((row) => row.ticketsCount > 0).length,
    }
  }, [rows])

  if (loading) return <div className="h-56 animate-pulse rounded-3xl bg-white/[0.06]" />

  if (error) {
    return (
      <div className="rounded-3xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-[15px] text-red-300">
        {error}
      </div>
    )
  }

  // El backend ordena por total (entradas + barra); acá se reordena por lo que la lista muestra,
  // si no un promotor con mucha barra quedaría arriba de otro con más entradas.
  const visibleRows = rows
    .filter((row) => row.ticketsCount > 0)
    .sort(
      (a, b) =>
        Number.parseFloat(b.ticketRevenue) - Number.parseFloat(a.ticketRevenue) ||
        a.name.localeCompare(b.name)
    )
  const hasSales = totals.ticketsCount > 0

  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[12px] uppercase tracking-[0.18em] text-white/40">Ventas del evento</p>

        <div className="mt-4 grid gap-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-white/[0.08]">
          <div className="sm:pr-6">
            <div className="flex items-center gap-2 text-white/45">
              <Ticket className="h-4 w-4" />
              <span className="text-[13px]">Entradas vendidas</span>
            </div>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
              {int(totals.ticketsCount)}
            </p>
            <p className="mt-1 text-[13px] text-white/35">
              {rows.length === 0
                ? "Todavía no tenés promotores"
                : `${int(totals.sellingPromoters)} de ${int(rows.length)} promotores vendieron`}
            </p>
          </div>

          <div className="sm:pl-6">
            <div className="flex items-center gap-2 text-white/45">
              <Wallet className="h-4 w-4" />
              <span className="text-[13px]">Recaudado</span>
            </div>
            <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-emerald-300/90 sm:text-4xl">
              {money(totals.ticketRevenue)}
            </p>
            <p className="mt-1 text-[13px] text-white/35">por entradas de tus promotores</p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[15px] text-white/45 sm:px-6">
          Todavía no tenés promotores. Invitá uno más abajo y sus ventas aparecen acá.
        </p>
      ) : !hasSales ? (
        <p className="px-5 py-8 text-center text-[15px] text-white/45 sm:px-6">
          Todavía no hay entradas vendidas por tus promotores en este evento.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {visibleRows.map((row) => {
            const revenue = Number.parseFloat(row.ticketRevenue)
            const share = totals.ticketRevenue > 0 ? (revenue / totals.ticketRevenue) * 100 : 0
            return (
              <li key={row.id} className="px-5 py-4 sm:px-6">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 truncate text-[15px] font-medium text-white/90">
                    {row.name}
                    {!row.isActive ? (
                      <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-normal text-white/40">
                        dado de baja
                      </span>
                    ) : null}
                  </p>
                  <p className="shrink-0 text-[16px] font-semibold tabular-nums text-white">
                    {money(row.ticketRevenue)}
                  </p>
                </div>

                {/* La barra y sus números en la misma línea: la fila se lee de un vistazo en el
                    celular y la barra aprovecha el ancho en escritorio. */}
                <div className="mt-2.5 flex items-center gap-3">
                  <div
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
                    role="img"
                    aria-label={`${row.name}: ${shareLabel(revenue, totals.ticketRevenue)} del recaudado`}
                  >
                    <div
                      className="h-full rounded-full bg-[#FF9500] transition-[width] duration-500"
                      style={{ width: `${Math.max(share, 1.5)}%` }}
                    />
                  </div>
                  <span className="w-[5.5rem] shrink-0 text-right text-[13px] tabular-nums text-white/40">
                    {int(row.ticketsCount)} {ticketsWord(row.ticketsCount)}
                  </span>
                  <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-white/40">
                    {shareLabel(revenue, totals.ticketRevenue)}
                  </span>
                </div>

                {Number.parseFloat(row.barRevenue) > 0 ? (
                  <p className="mt-1.5 text-[13px] text-white/35">
                    + {money(row.barRevenue)} en barra
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
