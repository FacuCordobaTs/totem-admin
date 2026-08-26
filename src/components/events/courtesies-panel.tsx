import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { getCourtesyUrl } from "@/lib/client-app-url"
import { Check, Copy, Gift, Loader2, Plus, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiTicketType } from "./ticket-types"
import type { EventMenuProductRow } from "@/types/event-dashboard"

type DrinkLine = { productId: string; quantity: number }

type Courtesy = {
  id: string
  eventId: string
  ticketTypeId: string
  guestName: string
  guestEmail: string | null
  token: string
  status: "PENDING" | "REDEEMED" | "REVOKED"
  ticketId: string | null
  drinkLines: DrinkLine[]
  redeemedAt: string | null
  // Tarea 7.3 — estado del envío de la invitación y quién la creó.
  inviteSentAt: string | null
  createdByName: string | null
  createdAt: string | null
}

type CourtesiesResponse = { courtesies: Courtesy[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }
type MenuResponse = { products: EventMenuProductRow[] }

const fieldClass =
  "h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors focus:border-white/25"

const STATUS_LABEL: Record<Courtesy["status"], string> = {
  PENDING: "Sin canjear",
  REDEEMED: "Canjeada",
  REVOKED: "Anulada",
}

function CourtesyRow({
  courtesy,
  typeName,
  productName,
  onRevoke,
  onSendInvite,
}: {
  courtesy: Courtesy
  typeName: string
  productName: (id: string) => string
  onRevoke: (id: string) => void
  onSendInvite: (id: string) => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(getCourtesyUrl(courtesy.token))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Tarea 7.3 — envío manual de la invitación (o reenvío) desde el panel.
  async function send() {
    if (sending || !courtesy.guestEmail) return
    setSending(true)
    setSendError(null)
    try {
      await onSendInvite(courtesy.id)
      setJustSent(true)
      setTimeout(() => setJustSent(false), 2000)
    } catch (err) {
      setSendError(
        err instanceof ApiError ? err.message : "No se pudo enviar la invitación"
      )
    } finally {
      setSending(false)
    }
  }

  const revoked = courtesy.status === "REVOKED"
  const redeemed = courtesy.status === "REDEEMED"

  // Tragos de regalo (tarea 7.1): "· 2× Fernet · 1× Gancia" cuando la invitación trae.
  const drinksSummary = courtesy.drinkLines
    .map((l) => `${l.quantity}× ${productName(l.productId)}`)
    .join(" · ")

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5",
        revoked && "opacity-45"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white">
          {courtesy.guestName}
        </p>
        <p className="truncate text-[12px] text-white/40">
          {typeName} · {STATUS_LABEL[courtesy.status]}
          {courtesy.createdByName ? ` · invitó ${courtesy.createdByName}` : ""}
          {courtesy.inviteSentAt ? " · invitación enviada" : ""}
          {drinksSummary ? ` · ${drinksSummary}` : ""}
        </p>
        {sendError ? (
          <p className="mt-0.5 text-[11px] text-red-400">{sendError}</p>
        ) : null}
      </div>
      {!revoked ? (
        <>
          {courtesy.guestEmail ? (
            <button
              type="button"
              onClick={send}
              disabled={sending || justSent}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 text-[12px] text-white/60 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : justSent ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {sending
                ? "Enviando…"
                : justSent
                  ? "Enviada"
                  : courtesy.inviteSentAt
                    ? "Reenviar"
                    : "Enviar"}
            </button>
          ) : null}
          {!redeemed ? (
            <>
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 text-[12px] text-white/60 transition-colors hover:border-white/25 hover:text-white"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copiado" : "Link"}
              </button>
              <button
                type="button"
                onClick={() => onRevoke(courtesy.id)}
                className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-red-400"
                aria-label="Anular invitación"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function CourtesiesPanel({
  eventId,
  refreshTrigger,
  onChanged,
}: {
  eventId: string
  refreshTrigger: number
  onChanged?: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"

  const [courtesies, setCourtesies] = useState<Courtesy[]>([])
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [menu, setMenu] = useState<EventMenuProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [guestName, setGuestName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [ticketTypeId, setTicketTypeId] = useState("")
  const [drinks, setDrinks] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const [cRes, tRes, mRes] = await Promise.all([
        apiFetch<CourtesiesResponse>(`/events/${eventId}/courtesies`, {
          method: "GET",
          token,
        }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
          method: "GET",
          token,
        }),
        apiFetch<MenuResponse>(`/events/${eventId}/products`, {
          method: "GET",
          token,
        }),
      ])
      setCourtesies(cRes.courtesies)
      setTypes(tRes.ticketTypes)
      // Tragos de regalo (tarea 7.1): solo los que están activos en el menú del evento.
      setMenu(mRes.products.filter((p) => p.isActiveForEvent))
      if (!ticketTypeId && tRes.ticketTypes.length > 0) {
        setTicketTypeId(tRes.ticketTypes[0].id)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cortesías")
    } finally {
      setLoading(false)
    }
    // ticketTypeId intentionally omitted: only seeds the default once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  const setDrinkQty = (productId: string, quantity: number) => {
    const next = { ...drinks }
    if (quantity <= 0) delete next[productId]
    else next[productId] = quantity
    setDrinks(next)
  }

  async function create() {
    if (!token || saving) return
    if (guestName.trim() === "") {
      setFormError("Poné el nombre del invitado")
      return
    }
    if (!ticketTypeId) {
      setFormError("Elegí un tipo de entrada")
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      const drinkLines = Object.entries(drinks)
        .filter(([, qty]) => qty > 0)
        .map(([productId, quantity]) => ({ productId, quantity }))
      await apiFetch(`/events/${eventId}/courtesies`, {
        method: "POST",
        token,
        body: JSON.stringify({
          ticketTypeId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || null,
          drinkLines,
        }),
      })
      setGuestName("")
      setGuestEmail("")
      setDrinks({})
      await load()
      onChanged?.()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo crear la invitación")
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id: string) {
    if (!token) return
    try {
      await apiFetch(`/events/${eventId}/courtesies/${id}/revoke`, {
        method: "POST",
        token,
      })
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular")
    }
  }

  // Tarea 7.3 — envío (o reenvío) de la invitación por email. Lanza para que la fila
  // muestre el error en línea; el listado se recarga para reflejar `inviteSentAt`.
  async function sendInvite(id: string) {
    if (!token) return
    await apiFetch(`/events/${eventId}/courtesies/${id}/send-invite`, {
      method: "POST",
      token,
    })
    await load()
    onChanged?.()
  }

  const typeName = (id: string) =>
    types.find((t) => t.id === id)?.name ?? "—"
  const productName = (id: string) =>
    menu.find((p) => p.id === id)?.name ?? "—"
  const active = courtesies.filter((c) => c.status !== "REVOKED")
  const drinksCount = Object.values(drinks).reduce((a, b) => a + b, 0)

  if (!canManage) return null

  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-white/40" />
          <h3 className="text-[17px] font-medium text-foreground">
            Cortesías
          </h3>
          {active.length > 0 ? (
            <span className="text-[13px] text-white/35">· {active.length}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[13px] text-white/50 transition-colors hover:text-white/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Invitar
        </button>
      </div>

      {open ? (
        <div className="mb-3 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Nombre del invitado"
              className={cn(fieldClass, "min-w-[160px] flex-1")}
            />
            <input
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="Correo (opcional)"
              type="email"
              className={cn(fieldClass, "min-w-[160px] flex-1")}
            />
            <select
              value={ticketTypeId}
              onChange={(e) => setTicketTypeId(e.target.value)}
              className={cn(fieldClass, "w-auto min-w-[120px]")}
            >
              {types.length === 0 ? (
                <option value="">Sin tipos</option>
              ) : (
                types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={create}
              disabled={saving || types.length === 0}
              className="h-10 shrink-0 rounded-lg bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {saving ? "…" : "Crear link"}
            </button>
          </div>

          {menu.length > 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <p className="text-[12px] font-medium text-white/50">
                  Tragos de regalo
                </p>
                {drinksCount > 0 ? (
                  <span className="text-[12px] text-[#FF9500]">
                    {drinksCount} trago{drinksCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <div className="max-h-40 overflow-y-auto px-3 pb-2.5">
                <div className="space-y-1">
                  {menu.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2"
                    >
                      <p className="min-w-0 flex-1 truncate text-[13px] text-white/70">
                        {p.name}
                        <span className="ml-1.5 text-[11px] text-white/35">
                          ${Number(p.price).toLocaleString("es-AR")}
                        </span>
                      </p>
                      <input
                        value={drinks[p.id] ?? 0}
                        onChange={(e) =>
                          setDrinkQty(p.id, Math.max(0, Math.floor(Number(e.target.value) || 0)))
                        }
                        onBlur={() => {
                          if ((drinks[p.id] ?? 0) === 0) {
                            const next = { ...drinks }
                            delete next[p.id]
                            setDrinks(next)
                          }
                        }}
                        type="number"
                        min={0}
                        max={99}
                        aria-label={`Tragos de ${p.name}`}
                        className={cn(fieldClass, "h-8 w-16 px-2 text-[13px] text-right")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {formError ? <p className="text-[12px] text-red-400">{formError}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="py-2 text-[14px] text-red-400">{error}</p>
      ) : loading ? (
        <p className="py-2 text-[14px] text-white/40">Cargando…</p>
      ) : courtesies.length === 0 ? (
        <p className="py-2 text-[14px] text-white/35">
          Sin cortesías. Las invitaciones se cuentan aparte de las ventas.
        </p>
      ) : (
        <div className="space-y-1.5">
          {courtesies.map((c) => (
            <CourtesyRow
              key={c.id}
              courtesy={c}
              typeName={typeName(c.ticketTypeId)}
              productName={productName}
              onRevoke={revoke}
              onSendInvite={sendInvite}
            />
          ))}
        </div>
      )}
    </section>
  )
}
