import { useCallback, useEffect, useMemo, useState } from "react"
import { LogOut, Plus, Ticket, TrendingUp, Users } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type PromoterEvent = { id: string; name: string; date: string; status: "draft" | "on_sale" | "live" | "closed" }
type TicketType = { id: string; name: string; price: string; effectivePrice?: string; stockLimit: number | null; sold: number }
type OwnTicket = { id: string; status: "PENDING" | "USED" | "CANCELLED"; buyerName: string | null; buyerEmail: string | null; createdAt: string | null; ticketTypeName: string; price: string }

type EventsResponse = { promoter: { id: string; name: string }; events: PromoterEvent[] }
type DetailResponse = {
  promoter: { id: string; name: string }
  event: PromoterEvent
  stats: { ticketsCount: number; ticketRevenue: string }
  tickets: OwnTicket[]
}

function money(value: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value))
}

function eventDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

/** Área mínima y aislada: el promotor sólo ve sus eventos asignados y sus propias ventas. */
export function PromoterPage() {
  const token = useAuthStore((state) => state.token)
  const staff = useAuthStore((state) => state.staff)
  const logout = useAuthStore((state) => state.logout)
  const [events, setEvents] = useState<PromoterEvent[]>([])
  const [eventId, setEventId] = useState("")
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [types, setTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticketTypeId, setTicketTypeId] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [selling, setSelling] = useState(false)
  const [qrHash, setQrHash] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<EventsResponse>("/promoters/me/events", { method: "GET", token })
      setEvents(data.events)
      setEventId((current) => current && data.events.some((event) => event.id === current) ? current : data.events.find((event) => event.status !== "closed")?.id ?? data.events[0]?.id ?? "")
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudieron cargar tus eventos")
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadEvent = useCallback(async () => {
    if (!token || !eventId) {
      setDetail(null)
      setTypes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [own, ticketTypes] = await Promise.all([
        apiFetch<DetailResponse>(`/promoters/me/events/${eventId}`, { method: "GET", token }),
        apiFetch<{ ticketTypes: TicketType[] }>(`/events/${eventId}/ticket-types`, { method: "GET", token }),
      ])
      setDetail(own)
      setTypes(ticketTypes.ticketTypes)
      setTicketTypeId((current) => current && ticketTypes.ticketTypes.some((type) => type.id === current) ? current : ticketTypes.ticketTypes.find((type) => type.stockLimit == null || type.sold < type.stockLimit)?.id ?? "")
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo cargar el evento")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => { void loadEvents() }, [loadEvents])
  useEffect(() => { void loadEvent() }, [loadEvent])

  const selectedType = useMemo(() => types.find((type) => type.id === ticketTypeId), [ticketTypeId, types])
  const soldOut = selectedType?.stockLimit != null && selectedType.sold >= selectedType.stockLimit
  const canSell = detail?.event.status !== "closed" && Boolean(ticketTypeId) && !soldOut

  async function sell() {
    if (!token || !eventId || !ticketTypeId || !canSell || selling) return
    setSelling(true)
    try {
      const result = await apiFetch<{ ticket: { qrHash: string; id: string; buyerEmail: string | null } }>("/tickets/sell", {
        method: "POST",
        token,
        body: JSON.stringify({ eventId, ticketTypeId, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim() }),
      })
      if (result.ticket.buyerEmail?.trim()) {
        try { await apiFetch(`/tickets/${result.ticket.id}/send-email`, { method: "POST", token }) } catch { /* El QR queda disponible aunque falle el email. */ }
      }
      setBuyerName("")
      setBuyerEmail("")
      setQrHash(result.ticket.qrHash)
      toast.success("Entrada emitida a tu nombre")
      await loadEvent()
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "No se pudo emitir la entrada")
    } finally {
      setSelling(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#F2F2F7] text-black dark:bg-black dark:text-white">
      <header className="border-b border-zinc-200/60 bg-white/80 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-black/80 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-[#FF9500]">Crow · Promotores</p><h1 className="mt-1 text-xl font-bold">Hola, {staff?.name ?? "promotor"}</h1></div>
          <Button type="button" variant="ghost" onClick={logout} className="gap-2 text-zinc-500"><LogOut className="h-4 w-4" />Salir</Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-5 py-7 sm:px-8">
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p> : null}
        {events.length > 1 ? <Select value={eventId} onValueChange={setEventId}><SelectTrigger className="h-12 rounded-xl bg-background"><SelectValue placeholder="Elegí un evento" /></SelectTrigger><SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.name} · {eventDate(event.date)}</SelectItem>)}</SelectContent></Select> : null}
        {loading ? <div className="h-56 animate-pulse rounded-2xl bg-white dark:bg-zinc-900" /> : !detail ? <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 dark:bg-zinc-900">Todavía no tenés eventos asignados. Pedile a la productora que te sume al evento.</div> : <>
          <section className="rounded-3xl bg-[#FF9500] p-6 text-white"><p className="text-sm text-white/75">{detail.event.name} · {eventDate(detail.event.date)}</p><h2 className="mt-2 text-3xl font-bold">Mis ventas</h2><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/10 p-4"><Users className="h-5 w-5" /><p className="mt-3 text-2xl font-bold">{detail.stats.ticketsCount}</p><p className="text-sm text-white/75">entradas vendidas</p></div><div className="rounded-2xl bg-black/10 p-4"><TrendingUp className="h-5 w-5" /><p className="mt-3 text-2xl font-bold">{money(detail.stats.ticketRevenue)}</p><p className="text-sm text-white/75">recaudado</p></div></div></section>

          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-zinc-900"><div className="mb-5 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF9500]/10 text-[#FF9500]"><Plus className="h-5 w-5" /></span><div><h2 className="font-bold">Nueva venta</h2><p className="text-sm text-zinc-500">La entrada queda atribuida automáticamente a vos.</p></div></div>
            {detail.event.status === "closed" ? <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-800">Este evento ya está cerrado.</p> : <div className="space-y-3"><Select value={ticketTypeId} onValueChange={setTicketTypeId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Tipo de entrada" /></SelectTrigger><SelectContent>{types.map((type) => <SelectItem key={type.id} value={type.id} disabled={type.stockLimit != null && type.sold >= type.stockLimit}>{type.name} · {money(type.effectivePrice ?? type.price)}</SelectItem>)}</SelectContent></Select><Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Nombre (opcional)" className="h-11 rounded-xl" /><Input value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} placeholder="Correo para enviar el QR (opcional)" type="email" className="h-11 rounded-xl" /><Button type="button" disabled={!canSell || selling} onClick={() => void sell()} className="h-11 w-full rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90"><Ticket className="mr-2 h-4 w-4" />{selling ? "Emitiendo…" : soldOut ? "Tipo agotado" : "Emitir entrada"}</Button></div>}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-zinc-900"><h2 className="font-bold">Mis entradas emitidas</h2><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{detail.tickets.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Aún no registraste ventas en este evento.</p> : detail.tickets.map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{ticket.buyerName || "Sin nombre"}</p><p className="text-sm text-zinc-500">{ticket.ticketTypeName} · {money(ticket.price)}</p></div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{ticket.status === "PENDING" ? "Emitida" : ticket.status === "USED" ? "Usada" : "Anulada"}</span></div>)}</div></section>
        </>}
      </div>

      {qrHash ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"><div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center text-black"><h2 className="text-xl font-bold">Entrada emitida</h2><p className="mt-1 text-sm text-zinc-500">Compartí este QR con la persona.</p><div className="mx-auto mt-5 inline-block rounded-2xl border p-4"><QRCodeSVG value={qrHash} size={188} level="M" includeMargin /></div><Button type="button" onClick={() => setQrHash(null)} className="mt-5 w-full rounded-xl bg-[#FF9500] text-white">Listo</Button></div></div> : null}
    </main>
  )
}
