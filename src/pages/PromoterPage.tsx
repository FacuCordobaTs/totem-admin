import { useCallback, useEffect, useState } from "react"
import { Copy, LogOut, TrendingUp, Users } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { getPromoterEventShopUrl } from "@/lib/client-app-url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type PromoterEvent = { id: string; slug: string | null; name: string; date: string; status: "draft" | "on_sale" | "live" | "closed" }
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      return
    }
    setLoading(true)
    setError(null)
    try {
      const own = await apiFetch<DetailResponse>(`/promoters/me/events/${eventId}`, { method: "GET", token })
      setDetail(own)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo cargar el evento")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => { void loadEvents() }, [loadEvents])
  useEffect(() => { void loadEvent() }, [loadEvent])

  const promoterLink = detail ? getPromoterEventShopUrl(detail.event.slug ?? detail.event.id, detail.promoter.id) : null

  function copyPromoterLink() {
    if (!promoterLink) return
    void navigator.clipboard.writeText(promoterLink)
    toast.success("Tu link de venta fue copiado")
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

          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-zinc-900">
            <h2 className="font-bold">Mi link de venta</h2>
            <p className="mt-1 text-sm text-zinc-500">Compartilo para que las compras de este evento queden asociadas a vos.</p>
            <div className="mt-4 flex gap-2">
              <Input readOnly value={promoterLink ?? ""} className="h-11 min-w-0 font-mono text-xs" />
              <Button type="button" size="icon" onClick={copyPromoterLink} aria-label="Copiar mi link de venta" className="h-11 w-11 shrink-0 bg-[#FF9500] text-white hover:bg-[#FF9500]/90"><Copy className="h-4 w-4" /></Button>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-zinc-900"><h2 className="font-bold">Entradas vendidas</h2><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{detail.tickets.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Aún no registraste ventas en este evento.</p> : detail.tickets.map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{ticket.buyerName || "Sin nombre"}</p><p className="text-sm text-zinc-500">{ticket.ticketTypeName} · {money(ticket.price)}</p></div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{ticket.status === "PENDING" ? "Emitida" : ticket.status === "USED" ? "Usada" : "Anulada"}</span></div>)}</div></section>
        </>}
      </div>
    </main>
  )
}
