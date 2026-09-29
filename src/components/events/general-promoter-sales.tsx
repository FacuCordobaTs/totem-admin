import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, ExternalLink, Ticket, TrendingUp, Wallet } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { getPromoterEventShopUrl } from "@/lib/client-app-url"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import type {
  EventPromoterSalesResponse,
  EventPromoterSalesRow,
  PromoterOwnEventResponse,
  PromoterOwnTicketRow,
} from "@/types/event-dashboard"

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

function ticketStatusLabel(status: PromoterOwnTicketRow["status"]): string {
  if (status === "USED") return "Usada"
  if (status === "CANCELLED") return "Anulada"
  return "Emitida"
}

/** Cuántas entradas propias se listan antes de resumir el resto. */
const OWN_TICKETS_SHOWN = 8

type Props = {
  eventId: string
  /** Cambia cuando la cartera cambió (alta o baja de un promotor) para volver a pedir los números. */
  refreshToken?: number
}

/**
 * Tablero del promotor general dentro del evento, en dos bloques bien separados porque son dos
 * cosas distintas: **sus propias ventas** (vende con su link, igual que un promotor normal) y las
 * de **su equipo** (los promotores que él dio de alta).
 *
 * Los números propios salen de `GET /promoters/me/events/:eventId` —el mismo espacio de venta que
 * usa el rol PROMOTER, que además trae sus entradas—; los del equipo, de
 * `GET /events/:id/promoter-sales`, que para este rol ya viene acotado a su cartera
 * (`promoters.owner_staff_id`).
 *
 * El reparto del equipo se lee con una barra de participación por promotor: en el celular la fila
 * apila nombre, monto y barra; desde `sm` los totales pasan a dos columnas.
 */
export function GeneralPromoterSalesPanel({ eventId, refreshToken = 0 }: Props) {
  const token = useAuthStore((s) => s.token)
  const [own, setOwn] = useState<PromoterOwnEventResponse | null>(null)
  const [team, setTeam] = useState<EventPromoterSalesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [ownSales, teamSales] = await Promise.all([
        apiFetch<PromoterOwnEventResponse>(`/promoters/me/events/${eventId}`, { method: "GET", token }),
        apiFetch<EventPromoterSalesResponse>(`/events/${eventId}/promoter-sales`, { method: "GET", token }),
      ])
      setOwn(ownSales)
      setTeam(teamSales.promoters)
    } catch (err) {
      setOwn(null)
      setTeam([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las ventas")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const teamTotals = useMemo(() => {
    const ticketRevenue = team.reduce((sum, row) => sum + Number.parseFloat(row.ticketRevenue), 0)
    return {
      ticketsCount: team.reduce((sum, row) => sum + row.ticketsCount, 0),
      ticketRevenue,
      sellingPromoters: team.filter((row) => row.ticketsCount > 0).length,
    }
  }, [team])

  /**
   * El backend ordena por total (entradas + barra); acá se reordena por lo que la lista muestra,
   * si no un promotor con mucha barra quedaría arriba de otro con más entradas.
   */
  const visibleTeam = useMemo(
    () =>
      team
        .filter((row) => row.ticketsCount > 0)
        .sort(
          (a, b) =>
            Number.parseFloat(b.ticketRevenue) - Number.parseFloat(a.ticketRevenue) ||
            a.name.localeCompare(b.name)
        ),
    [team]
  )

  if (loading) return <div className="h-56 animate-pulse rounded-3xl bg-white/[0.06]" />

  if (error) {
    return (
      <div className="rounded-3xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-[15px] text-red-300">
        {error}
      </div>
    )
  }

  const ownTickets = own?.tickets ?? []
  const ownRevenue = Number.parseFloat(own?.stats.ticketRevenue ?? "0")
  const ownLink = own ? getPromoterEventShopUrl(own.event.slug ?? own.event.id, own.promoter.id) : ""
  // Total del evento visto por él: lo suyo más lo de su cartera.
  const grandTickets = (own?.stats.ticketsCount ?? 0) + teamTotals.ticketsCount
  const grandRevenue = ownRevenue + teamTotals.ticketRevenue

  function copyOwnLink() {
    if (!ownLink) return
    void navigator.clipboard.writeText(ownLink)
    toast.success("Tu link de venta fue copiado")
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[12px] uppercase tracking-[0.18em] text-white/40">Tus ventas</p>

          <div className="mt-4 grid gap-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-white/[0.08]">
            <div className="sm:pr-6">
              <div className="flex items-center gap-2 text-white/45">
                <Ticket className="h-4 w-4" />
                <span className="text-[13px]">Tus entradas vendidas</span>
              </div>
              <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                {int(own?.stats.ticketsCount ?? 0)}
              </p>
              <p className="mt-1 text-[13px] text-white/35">
                {own?.stats.ticketsCount
                  ? `${shareLabel(own.stats.ticketsCount, grandTickets)} del total del evento`
                  : "Con tu link de venta"}
              </p>
            </div>

            <div className="sm:pl-6">
              <div className="flex items-center gap-2 text-white/45">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[13px]">Tu recaudado</span>
              </div>
              <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-emerald-300/90 sm:text-4xl">
                {money(own?.stats.ticketRevenue ?? "0")}
              </p>
              <p className="mt-1 text-[13px] text-white/35">por tus propias entradas</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[13px] text-white/45">Tu link de venta</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={ownLink}
                aria-label="Tu link de venta"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/40 px-3 font-mono text-[12px] text-white/60"
              />
              <Button
                type="button"
                size="icon"
                onClick={copyOwnLink}
                aria-label="Copiar tu link de venta"
                className="h-11 w-11 shrink-0 bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                asChild
                type="button"
                size="icon"
                variant="outline"
                className="h-11 w-11 shrink-0 border-white/[0.14] bg-transparent text-white/70 hover:bg-white/[0.08] hover:text-white"
              >
                <a href={ownLink} target="_blank" rel="noreferrer" aria-label="Abrir tu link de venta">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-white/35">
              Lo que se venda por este link queda a tu nombre, aparte de las ventas de tus promotores.
            </p>
          </div>
        </div>

        {ownTickets.length > 0 ? (
          <div className="border-t border-white/[0.06]">
            <p className="px-5 pt-4 text-[12px] uppercase tracking-[0.18em] text-white/40 sm:px-6">
              Tus últimas entradas
            </p>
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {ownTickets.slice(0, OWN_TICKETS_SHOWN).map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-white/80">
                      {ticket.buyerName || "Sin nombre"}
                    </p>
                    <p className="text-[12px] text-white/40">{ticket.ticketTypeName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[14px] tabular-nums text-white/70">
                      {money(ticket.price)}
                    </span>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
                      {ticketStatusLabel(ticket.status)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {ownTickets.length > OWN_TICKETS_SHOWN ? (
              <p className="px-5 pb-4 pt-2 text-[12px] text-white/35 sm:px-6">
                y {int(ownTickets.length - OWN_TICKETS_SHOWN)} más
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[12px] uppercase tracking-[0.18em] text-white/40">Ventas de tu equipo</p>

          <div className="mt-4 grid gap-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-white/[0.08]">
            <div className="sm:pr-6">
              <div className="flex items-center gap-2 text-white/45">
                <Ticket className="h-4 w-4" />
                <span className="text-[13px]">Entradas vendidas</span>
              </div>
              <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                {int(teamTotals.ticketsCount)}
              </p>
              <p className="mt-1 text-[13px] text-white/35">
                {team.length === 0
                  ? "Todavía no tenés promotores"
                  : `${int(teamTotals.sellingPromoters)} de ${int(team.length)} promotores vendieron`}
              </p>
            </div>

            <div className="sm:pl-6">
              <div className="flex items-center gap-2 text-white/45">
                <Wallet className="h-4 w-4" />
                <span className="text-[13px]">Recaudado</span>
              </div>
              <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-emerald-300/90 sm:text-4xl">
                {money(teamTotals.ticketRevenue)}
              </p>
              <p className="mt-1 text-[13px] text-white/35">por entradas de tus promotores</p>
            </div>
          </div>
        </div>

        {team.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-white/45 sm:px-6">
            Todavía no tenés promotores. Invitá uno más abajo y sus ventas aparecen acá.
          </p>
        ) : teamTotals.ticketsCount === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-white/45 sm:px-6">
            Todavía no hay entradas vendidas por tus promotores en este evento.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {visibleTeam.map((row) => {
              const revenue = Number.parseFloat(row.ticketRevenue)
              const share =
                teamTotals.ticketRevenue > 0 ? (revenue / teamTotals.ticketRevenue) * 100 : 0
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
                      aria-label={`${row.name}: ${shareLabel(revenue, teamTotals.ticketRevenue)} del recaudado`}
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
                      {shareLabel(revenue, teamTotals.ticketRevenue)}
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

        {/* El total que él mueve en el evento: lo suyo más lo de su cartera. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/[0.08] bg-white/[0.02] px-5 py-4 sm:px-6">
          <p className="text-[13px] uppercase tracking-[0.14em] text-white/40">
            Vos + tus promotores
          </p>
          <p className="text-[15px] tabular-nums text-white/70">
            <span className="font-semibold text-white">{int(grandTickets)}</span>{" "}
            {ticketsWord(grandTickets)} ·{" "}
            <span className="font-semibold text-white">{money(grandRevenue)}</span>
          </p>
        </div>
      </section>
    </div>
  )
}
