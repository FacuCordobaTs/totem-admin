import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { getCourtesyUrl } from "@/lib/client-app-url"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, Copy, Gift, Loader2, Plus, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiTicketType } from "./ticket-types"
import type { EventMenuProductRow } from "@/types/event-dashboard"

type DrinkLine = { productId: string; quantity: number }
type Courtesy = {
  id: string; ticketTypeId: string; guestName: string; guestEmail: string | null
  guestDni: string | null; token: string; status: "PENDING" | "REDEEMED" | "REVOKED"
  drinkLines: DrinkLine[]; inviteSentAt: string | null; createdAt: string | null
}
type CourtesiesResponse = { courtesies: Courtesy[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }
type MenuResponse = { products: EventMenuProductRow[] }

const fieldClass = "h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[14px] text-white outline-none transition-colors focus:border-white/25"

export function CourtesiesPanel({ eventId, refreshTrigger, onChanged }: {
  eventId: string; refreshTrigger: number; onChanged?: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const [courtesies, setCourtesies] = useState<Courtesy[]>([])
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [menu, setMenu] = useState<EventMenuProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [guestDni, setGuestDni] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Record<string, number>>({})
  const [drinks, setDrinks] = useState<Record<string, number>>({})
  const [giftBalance, setGiftBalance] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setLoading(true); setError(null)
    try {
      const [cRes, tRes, mRes] = await Promise.all([
        apiFetch<CourtesiesResponse>(`/events/${eventId}/courtesies`, { method: "GET", token }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, { method: "GET", token }),
        apiFetch<MenuResponse>(`/events/${eventId}/products`, { method: "GET", token }),
      ])
      setCourtesies(cRes.courtesies); setTypes(tRes.ticketTypes)
      setMenu(mRes.products.filter((p) => p.isActiveForEvent))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cortesías")
    } finally { setLoading(false) }
  }, [token, eventId])

  useEffect(() => { void load() }, [load, refreshTrigger])

  const closeCreate = () => {
    setCreateOpen(false); setFormError(null); setGuestName(""); setGuestDni(""); setGuestEmail("")
    setSelectedTypes({}); setDrinks({}); setGiftBalance("")
  }
  const addType = (id: string) => setSelectedTypes((current) => ({
    ...current,
    [id]: (current[id] ?? 0) + 1,
  }))
  const setDrinkQty = (id: string, quantity: number) => setDrinks((current) => {
    const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next
  })

  async function create() {
    if (!token || saving) return
    const dni = guestDni.replace(/\D/g, "")
    const balance = giftBalance.trim() === "" ? 0 : Number(giftBalance.replace(",", "."))
    if (!guestName.trim()) return setFormError("Ingresá el nombre del invitado")
    if (!dni || dni.length < 6) return setFormError("Ingresá un DNI válido")
    const ticketLines = Object.entries(selectedTypes).filter(([, quantity]) => quantity > 0)
    if (ticketLines.length === 0) return setFormError("Elegí al menos un tipo de entrada")
    if (!Number.isFinite(balance) || balance < 0) return setFormError("El saldo no es válido")
    setSaving(true); setFormError(null)
    try {
      const drinkLines = Object.entries(drinks).map(([productId, quantity]) => ({ productId, quantity }))
      await Promise.all(ticketLines.flatMap(([ticketTypeId, quantity]) => Array.from({ length: quantity }, () => apiFetch(`/events/${eventId}/courtesies`, {
        method: "POST", token, body: JSON.stringify({ ticketTypeId, guestName: guestName.trim(), guestDni: dni, guestEmail: guestEmail.trim() || null, drinkLines }),
      }))))
      if (balance > 0) await apiFetch(`/events/${eventId}/balance/gift`, {
        method: "POST", token, body: JSON.stringify({ dni, amount: balance.toFixed(2), name: guestName.trim(), note: "Cortesía de evento" }),
      })
      await load(); onChanged?.(); closeCreate()
    } catch (err) { setFormError(err instanceof ApiError ? err.message : "No se pudo crear la cortesía") }
    finally { setSaving(false) }
  }
  async function revoke(id: string) {
    if (!token) return
    try { await apiFetch(`/events/${eventId}/courtesies/${id}/revoke`, { method: "POST", token }); await load(); onChanged?.() }
    catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo anular la cortesía") }
  }
  async function sendInvite(id: string) {
    if (!token) return
    try { await apiFetch(`/events/${eventId}/courtesies/${id}/send-invite`, { method: "POST", token }); await load() }
    catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo enviar la invitación") }
  }
  if (!canManage) return null
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? "—"
  const productName = (id: string) => menu.find((product) => product.id === id)?.name ?? "—"
  const activeCount = courtesies.filter((item) => item.status !== "REVOKED").length

  return <section className="mt-7 flex justify-center">
    <Button type="button" variant="outline" onClick={() => setListOpen(true)} className="h-10 rounded-xl border-white/[0.12] bg-white/[0.03] px-4 text-white/70 hover:bg-white/[0.08] hover:text-white">
      <Gift className="mr-2 h-4 w-4" /> Cortesías{activeCount ? ` · ${activeCount}` : ""}
    </Button>
    <Dialog open={listOpen} onOpenChange={setListOpen}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl border-white/[0.10] bg-black p-0 text-white">
        <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left"><DialogTitle className="text-xl">Cortesías</DialogTitle></DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 py-4">
          {error ? <p className="text-sm text-red-400">{error}</p> : loading ? <p className="text-sm text-white/40">Cargando…</p> : courtesies.length === 0 ? <p className="py-8 text-center text-sm text-white/35">Todavía no hay cortesías.</p> :
            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
              <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white/35"><span>Invitado</span><span>Entrada</span><span>Estado</span><span /></div>
              {courtesies.map((courtesy) => <CourtesyLine key={courtesy.id} courtesy={courtesy} typeName={typeName(courtesy.ticketTypeId)} drinks={courtesy.drinkLines.map((line) => `${line.quantity}× ${productName(line.productId)}`).join(" · ")} onRevoke={revoke} onSend={sendInvite} />)}
            </div>}
        </div>
        <div className="border-t border-white/[0.07] p-5 text-center"><Button onClick={() => setCreateOpen(true)} className="h-10 rounded-xl bg-[#FF9500] px-5 text-white hover:bg-[#ff9500]/90"><Plus className="mr-1.5 h-4 w-4" /> Nueva cortesía</Button></div>
      </DialogContent>
    </Dialog>
    {createOpen ? <CourtesyCreator types={types} menu={menu} guestName={guestName} guestDni={guestDni} guestEmail={guestEmail} selectedTypes={selectedTypes} drinks={drinks} giftBalance={giftBalance} saving={saving} error={formError} onName={setGuestName} onDni={setGuestDni} onEmail={setGuestEmail} onAddType={addType} onAddDrink={(id) => setDrinkQty(id, (drinks[id] ?? 0) + 1)} onBalance={setGiftBalance} onCreate={() => void create()} onClose={closeCreate} /> : null}
  </section>
}

function CourtesyLine({ courtesy, typeName, drinks, onRevoke, onSend }: { courtesy: Courtesy; typeName: string; drinks: string; onRevoke: (id: string) => void; onSend: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const revoked = courtesy.status === "REVOKED"
  return <div className={cn("grid grid-cols-[minmax(0,1fr)_110px_120px_auto] items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-sm last:border-0", revoked && "opacity-45")}>
    <div className="min-w-0"><p className="truncate font-medium">{courtesy.guestName}</p><p className="truncate text-xs text-white/35">{courtesy.guestDni ?? "Sin DNI"}{drinks ? ` · ${drinks}` : ""}</p></div><span className="truncate text-white/65">{typeName}</span><span className="text-xs text-white/45">{courtesy.status === "PENDING" ? "Sin canjear" : courtesy.status === "REDEEMED" ? "Canjeada" : "Anulada"}</span>
    <div className="flex gap-1">{!revoked && courtesy.guestEmail ? <button onClick={() => onSend(courtesy.id)} className="rounded p-1.5 text-white/40 hover:bg-white/[0.07] hover:text-white" title="Enviar invitación"><Send className="h-3.5 w-3.5" /></button> : null}{!revoked && courtesy.status !== "REDEEMED" ? <><button onClick={() => { void navigator.clipboard.writeText(getCourtesyUrl(courtesy.token)); setCopied(true); setTimeout(() => setCopied(false), 1200) }} className="rounded p-1.5 text-white/40 hover:bg-white/[0.07] hover:text-white" title="Copiar link">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button><button onClick={() => onRevoke(courtesy.id)} className="rounded p-1.5 text-white/35 hover:bg-white/[0.07] hover:text-red-400" title="Anular"><X className="h-3.5 w-3.5" /></button></> : null}</div>
  </div>
}

function CourtesyCreator(props: { types: ApiTicketType[]; menu: EventMenuProductRow[]; guestName: string; guestDni: string; guestEmail: string; selectedTypes: Record<string, number>; drinks: Record<string, number>; giftBalance: string; saving: boolean; error: string | null; onName: (v: string) => void; onDni: (v: string) => void; onEmail: (v: string) => void; onAddType: (id: string) => void; onAddDrink: (id: string) => void; onBalance: (v: string) => void; onCreate: () => void; onClose: () => void }) {
  return <div className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-2xl rounded-2xl border border-white/[0.12] bg-black p-4 shadow-2xl shadow-black/70 animate-in slide-in-from-bottom-4">
    <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold">Nueva cortesía</h3><button onClick={props.onClose} className="rounded p-1 text-white/40 hover:text-white"><X className="h-4 w-4" /></button></div>
    <div className="grid gap-2 sm:grid-cols-3"><input className={fieldClass} placeholder="Nombre completo" value={props.guestName} onChange={(e) => props.onName(e.target.value)} autoFocus /><input className={fieldClass} placeholder="DNI" inputMode="numeric" value={props.guestDni} onChange={(e) => props.onDni(e.target.value)} /><input className={fieldClass} placeholder="Correo" type="email" value={props.guestEmail} onChange={(e) => props.onEmail(e.target.value)} /></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><ChoiceList title="Entradas" empty="No hay tipos de entrada" className="sm:col-span-1">{props.types.map((type) => <button type="button" key={type.id} onClick={() => props.onAddType(type.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"><span>{type.name}</span>{props.selectedTypes[type.id] ? <span className="rounded-md bg-[#FF9500]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FF9500]">×{props.selectedTypes[type.id]}</span> : <Plus className="h-3.5 w-3.5 text-white/35" />}</button>)}</ChoiceList><ChoiceList title="Tragos" empty="No hay tragos activos" className="sm:col-span-1">{props.menu.map((product) => <button type="button" key={product.id} onClick={() => props.onAddDrink(product.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"><span className="truncate">{product.name}</span>{props.drinks[product.id] ? <span className="rounded-md bg-[#FF9500]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FF9500]">×{props.drinks[product.id]}</span> : <Plus className="h-3.5 w-3.5 text-white/35" />}</button>)}</ChoiceList><div className="rounded-xl border border-white/[0.07] p-3"><label className="text-xs font-medium uppercase tracking-wide text-white/40">Saldo de regalo</label><input className={cn(fieldClass, "mt-2")} placeholder="$ 0" inputMode="decimal" value={props.giftBalance} onChange={(e) => props.onBalance(e.target.value)} /><p className="mt-2 text-xs leading-snug text-white/35">Se acredita al DNI del invitado.</p></div></div>
    {props.error ? <p className="mt-2 text-xs text-red-400">{props.error}</p> : null}
    <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={props.onClose} className="text-white/60">Cancelar</Button><Button onClick={props.onCreate} disabled={props.saving} className="bg-[#FF9500] text-white hover:bg-[#ff9500]/90">{props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cortesía"}</Button></div>
  </div>
}
function ChoiceList({ title, empty, className, children }: { title: string; empty: string; className?: string; children: React.ReactNode }) { return <div className={cn("max-h-36 overflow-y-auto rounded-xl border border-white/[0.07] p-3", className)}><p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/40">{title}</p>{children || <p className="text-xs text-white/35">{empty}</p>}</div> }
