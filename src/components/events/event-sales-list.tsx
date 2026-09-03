import { useCallback, useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSaleRowApi } from "@/types/event-dashboard"
import type { ApiTicketRow } from "@/components/events/attendee-table"
import type { ApiTicketType } from "@/components/events/ticket-types"

type Kind = "all" | "tickets" | "consumptions"
type Props = { eventId: string; onBack: () => void }
type TicketsResponse = { tickets: ApiTicketRow[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

type Row = { id: string; kind: Exclude<Kind, "all">; name: string; detail: string; amount: string; createdAt: Date | string | null }

function money(value: string) { const n = Number.parseFloat(value); return Number.isFinite(n) ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n) : "—" }
function date(value: Date | string | null) { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—" }

export function EventSalesList({ eventId, onBack }: Props) {
  const token = useAuthStore((s) => s.token)
  const [sales, setSales] = useState<EventSaleRowApi[]>([])
  const [tickets, setTickets] = useState<ApiTicketRow[]>([])
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [kind, setKind] = useState<Kind>("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const [salesResponse, ticketsResponse, typesResponse] = await Promise.all([
        apiFetch<{ sales: EventSaleRowApi[] }>(`/events/${eventId}/sales?limit=200&offset=0`, { method: "GET", token }),
        apiFetch<TicketsResponse>(`/events/${eventId}/tickets?orderBy=createdAt&order=desc`, { method: "GET", token }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, { method: "GET", token }),
      ])
      setSales(salesResponse.sales); setTickets(ticketsResponse.tickets.filter((ticket) => ticket.status !== "CANCELLED")); setTypes(typesResponse.ticketTypes)
    } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudieron cargar las ventas") }
    finally { setLoading(false) }
  }, [eventId, token])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => {
    const priceByType = new Map(types.map((type) => [type.id, type.price]))
    const ticketRows: Row[] = tickets.map((ticket) => ({ id: ticket.id, kind: "tickets", name: ticket.buyerName?.trim() || "Sin nombre", detail: ticket.ticketTypeName, amount: priceByType.get(ticket.ticketTypeId) ?? "0", createdAt: ticket.createdAt }))
    const consumptionRows: Row[] = sales.map((sale) => ({ id: sale.id, kind: "consumptions", name: sale.customerName?.trim() || "Consumidor final", detail: sale.itemsSummary, amount: sale.totalAmount, createdAt: sale.createdAt }))
    const needle = query.trim().toLocaleLowerCase()
    return [...ticketRows, ...consumptionRows]
      .filter((row) => kind === "all" || row.kind === kind)
      .filter((row) => !needle || `${row.name} ${row.detail}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
  }, [kind, query, sales, tickets, types])

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold tracking-tight text-white">Ventas</h2><p className="mt-1 text-sm text-white/45">Entradas y consumos registrados en el evento.</p></div><Button variant="ghost" onClick={onBack} className="text-white/65 hover:text-white">Volver a finanzas</Button></div>
    <div className="flex flex-wrap gap-3"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-white/35" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, entrada o consumo" className="h-10 border-white/[0.1] bg-white/[0.04] pl-9" /></div><Select value={kind} onValueChange={(value) => setKind(value as Kind)}><SelectTrigger className="h-10 w-44 border-white/[0.1] bg-white/[0.04]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo</SelectItem><SelectItem value="tickets">Entradas</SelectItem><SelectItem value="consumptions">Consumos</SelectItem></SelectContent></Select></div>
    {error ? <p className="text-red-400">{error}</p> : <div className="overflow-hidden rounded-2xl border border-white/[0.07]"><Table><TableHeader><TableRow className="border-white/[0.06]"><TableHead>Tipo</TableHead><TableHead>Cliente</TableHead><TableHead>Detalle</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-white/45">Cargando ventas…</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-white/45">No hay resultados.</TableCell></TableRow> : rows.map((row) => <TableRow key={`${row.kind}-${row.id}`} className="border-white/[0.06]"><TableCell><span className="rounded-full bg-white/[0.07] px-2 py-1 text-[11px] uppercase text-white/55">{row.kind === "tickets" ? "Entrada" : "Consumo"}</span></TableCell><TableCell className="font-medium text-white">{row.name}</TableCell><TableCell className="max-w-[260px] truncate text-white/55">{row.detail}</TableCell><TableCell className="whitespace-nowrap text-white/55">{date(row.createdAt)}</TableCell><TableCell className="text-right font-semibold tabular-nums text-white">{money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div>}
  </div>
}
