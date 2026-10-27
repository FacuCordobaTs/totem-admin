import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSaleRowApi } from "@/types/event-dashboard"
import type { ApiTicketRow } from "@/components/events/attendee-table"
import type { ApiTicketType } from "@/components/events/ticket-types"
import { useEventNestedView } from "@/components/events/event-mobile-nav"

type Kind = "all" | "tickets" | "consumptions"
type Props = { eventId: string; onBack: () => void; supportsConsumptions?: boolean }
type TicketsResponse = { tickets: ApiTicketRow[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

type Row = {
  id: string
  kind: Exclude<Kind, "all">
  name: string
  detail: string
  amount: string
  createdAt: Date | string | null
}

function money(value: string) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n)
    ? new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(n)
    : "—"
}

function date(value: Date | string | null) {
  const d = value ? new Date(value) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"
}

const tableHeadClass = "text-[11px] font-normal lowercase text-white/45"

export function EventSalesList({ eventId, onBack, supportsConsumptions = true }: Props) {
  const token = useAuthStore((s) => s.token)
  useEventNestedView(true)
  const [sales, setSales] = useState<EventSaleRowApi[]>([])
  const [tickets, setTickets] = useState<ApiTicketRow[]>([])
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [kind, setKind] = useState<Kind>("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [salesResponse, ticketsResponse, typesResponse] = await Promise.all([
        apiFetch<{ sales: EventSaleRowApi[] }>(
          `/events/${eventId}/sales?limit=200&offset=0`,
          { method: "GET", token }
        ),
        apiFetch<TicketsResponse>(
          `/events/${eventId}/tickets?orderBy=createdAt&order=desc`,
          { method: "GET", token }
        ),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
          method: "GET",
          token,
        }),
      ])
      setSales(salesResponse.sales)
      setTickets(
        ticketsResponse.tickets.filter((ticket) => ticket.status !== "CANCELLED")
      )
      setTypes(typesResponse.ticketTypes)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las ventas")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const priceByType = new Map(types.map((type) => [type.id, type.price]))
    const ticketRows: Row[] = tickets.map((ticket) => ({
      id: ticket.id,
      kind: "tickets",
      name: ticket.buyerName?.trim() || "Sin nombre",
      detail: ticket.ticketTypeName,
      amount: priceByType.get(ticket.ticketTypeId) ?? "0",
      createdAt: ticket.createdAt,
    }))
    const consumptionRows: Row[] = supportsConsumptions
      ? sales.map((sale) => ({
          id: sale.id,
          kind: "consumptions",
          name: sale.customerName?.trim() || "Consumidor final",
          detail: sale.itemsSummary,
          amount: sale.totalAmount,
          createdAt: sale.createdAt,
        }))
      : []
    const needle = query.trim().toLocaleLowerCase()
    return [...ticketRows, ...consumptionRows]
      .filter((row) => kind === "all" || row.kind === kind)
      .filter(
        (row) =>
          !needle || `${row.name} ${row.detail}`.toLocaleLowerCase().includes(needle)
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
      )
  }, [kind, query, sales, supportsConsumptions, tickets, types])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Finanzas
        </button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Ventas</h2>
          <p className="mt-1 text-[13px] text-white/45">
            {supportsConsumptions
              ? "Entradas y consumos registrados en el evento."
              : "Entradas registradas en el evento."}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              supportsConsumptions
                ? "Buscar cliente, entrada o consumo"
                : "Buscar cliente o entrada"
            }
            className="h-9 w-full rounded-xl border-0 bg-white/[0.06] pl-8 text-[13px] shadow-none placeholder:text-white/25 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"
          />
        </div>
        {supportsConsumptions ? (
          <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <SelectTrigger
              aria-label="Filtrar por tipo de venta"
              className="h-9 min-w-[130px] rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Todo</SelectItem>
              <SelectItem value="tickets">Entradas</SelectItem>
              <SelectItem value="consumptions">Consumos</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[14px] text-rose-300">
          {error}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table className="table-fixed md:table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className={`hidden pl-4 md:table-cell ${tableHeadClass}`}>
                  Tipo
                </TableHead>
                <TableHead className={`w-[68%] pl-4 md:w-auto md:pl-0 ${tableHeadClass}`}>
                  Cliente
                </TableHead>
                <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                  Detalle
                </TableHead>
                <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                  Fecha
                </TableHead>
                <TableHead className={`pr-4 text-right ${tableHeadClass}`}>
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {loading ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-[14px] text-white/40">
                    Cargando ventas…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-[14px] text-white/40">
                    No hay resultados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={`${row.kind}-${row.id}`}
                    className="border-0 transition-colors hover:bg-white/[0.03]"
                  >
                    <TableCell className="hidden py-3.5 pl-4 text-[12px] text-white/45 md:table-cell">
                      {row.kind === "tickets" ? "Entrada" : "Consumo"}
                    </TableCell>
                    <TableCell className="py-3.5 pl-4 md:pl-0">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span
                          className="truncate text-[15px] font-medium text-white"
                          title={row.name}
                        >
                          {row.name}
                        </span>
                        <span className="truncate text-[12px] text-white/35 md:hidden">
                          {row.kind === "tickets" ? "Entrada" : "Consumo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-3.5 text-[13px] text-white/45 md:table-cell">
                      <div className="truncate" title={row.detail}>
                        {row.detail}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-3.5 text-[13px] text-white/45 md:table-cell">
                      {date(row.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3.5 pr-4 text-right text-[14px] font-medium tabular-nums text-white">
                      {money(row.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
