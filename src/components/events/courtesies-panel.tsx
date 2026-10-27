import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { getCourtesyUrl } from "@/lib/client-app-url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Minus,
  Plus,
  Send,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEventNestedView } from "./event-mobile-nav"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

const fieldInputClass =
  "h-11 rounded-xl border-white/[0.12] bg-white/[0.04] px-3 text-[15px] text-white placeholder:text-white/25 shadow-none focus-visible:border-[#FF9500] focus-visible:ring-0"
const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const headClass = "text-[11px] font-normal lowercase text-white/45"

/** Mismo criterio visual que el estado de una entrada en Asistentes. */
function courtesyStatusPill(status: Courtesy["status"]) {
  if (status === "REVOKED") {
    return (
      <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300">
        Anulada
      </span>
    )
  }
  return (
    <span className={cn("text-[11px] font-normal lowercase", status === "REDEEMED" ? "text-white/45" : "text-white/60")}>
      {status === "REDEEMED" ? "canjeada" : "sin canjear"}
    </span>
  )
}

function FormField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-white/70">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-white/45">{hint}</p> : null}
    </div>
  )
}

function EditorBlock({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t border-white/[0.07] pt-7 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-8">
      <div>
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function QuantityRow({
  name,
  meta,
  quantity,
  onDecrease,
  onIncrease,
}: {
  name: string
  meta?: string
  quantity: number
  onDecrease: () => void
  onIncrease: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[14px] text-white/80">{name}</p>
        {meta ? <p className="truncate text-[12px] text-white/50">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Quitar ${name}`}
          disabled={quantity === 0}
          onClick={onDecrease}
          className="rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white disabled:opacity-25"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-6 text-center text-[14px] font-medium text-white tabular-nums" aria-live="polite">
          {quantity}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Agregar ${name}`}
          onClick={onIncrease}
          className="rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}

export function CourtesiesPanel({ eventId, refreshTrigger, onChanged, supportsConsumptions = true, onEditingChange }: {
  eventId: string; refreshTrigger: number; onChanged?: () => void; supportsConsumptions?: boolean
  /** Permite a la página ocultar el resto de Entradas mientras se crea una cortesía. */
  onEditingChange?: (editing: boolean) => void
}) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const [courtesies, setCourtesies] = useState<Courtesy[]>([])
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [menu, setMenu] = useState<EventMenuProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEventNestedView(creating)
  const [guestName, setGuestName] = useState("")
  const [guestDni, setGuestDni] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Record<string, number>>({})
  const [drinks, setDrinks] = useState<Record<string, number>>({})
  const [giftBalance, setGiftBalance] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const loaded = useRef(false)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    if (!loaded.current) setLoading(true)
    try {
      const [cRes, tRes, mRes] = await Promise.all([
        apiFetch<CourtesiesResponse>(`/events/${eventId}/courtesies`, { method: "GET", token }),
        apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, { method: "GET", token }),
        supportsConsumptions
          ? apiFetch<MenuResponse>(`/events/${eventId}/products`, { method: "GET", token })
          : Promise.resolve({ products: [] } as MenuResponse),
      ])
      setCourtesies(cRes.courtesies); setTypes(tRes.ticketTypes)
      setMenu(mRes.products.filter((p) => p.isActiveForEvent))
      loaded.current = true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las cortesías")
    } finally { setLoading(false) }
  }, [token, eventId, supportsConsumptions])

  useEffect(() => { void load() }, [load, refreshTrigger])

  useEffect(() => {
    onEditingChange?.(creating)
  }, [creating, onEditingChange])

  useEffect(() => {
    if (creating) window.scrollTo({ top: 0, behavior: "auto" })
  }, [creating])

  const closeCreate = () => {
    if (saving) return
    setCreating(false); setFormError(null); setGuestName(""); setGuestDni(""); setGuestEmail("")
    setSelectedTypes({}); setDrinks({}); setGiftBalance("")
  }
  const setTypeQty = (id: string, quantity: number) => setSelectedTypes((current) => {
    const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next
  })
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
      await load(); onChanged?.(); setSaving(false); closeCreate()
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
  const ticketCount = Object.values(selectedTypes).reduce((sum, quantity) => sum + quantity, 0)
  const drinkCount = Object.values(drinks).reduce((sum, quantity) => sum + quantity, 0)

  if (creating) {
    return (
      <section className="w-full" aria-labelledby="courtesy-create-title">
        <header className="space-y-2">
          <button
            type="button"
            onClick={closeCreate}
            className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Cortesías
          </button>
          <h2 id="courtesy-create-title" className="text-2xl font-bold tracking-tight text-white">
            Nueva cortesía
          </h2>
        </header>

        <form
          className="mt-7 max-w-3xl space-y-7 pb-2"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
          aria-label="Nueva cortesía"
        >
          <fieldset disabled={saving} className="space-y-7">
            <EditorBlock title="Invitado">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Nombre completo" htmlFor="courtesy-name">
                  <Input
                    autoFocus
                    id="courtesy-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nombre y apellido"
                    className={fieldInputClass}
                  />
                </FormField>
                <FormField label="DNI" htmlFor="courtesy-dni">
                  <Input
                    id="courtesy-dni"
                    inputMode="numeric"
                    value={guestDni}
                    onChange={(e) => setGuestDni(e.target.value)}
                    placeholder="Sin puntos"
                    className={cn(fieldInputClass, "tabular-nums")}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField
                    label="Correo"
                    hint="Opcional. Si lo cargás, podés enviarle la invitación desde la tabla."
                    htmlFor="courtesy-email"
                  >
                    <Input
                      id="courtesy-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="invitado@correo.com"
                      className={fieldInputClass}
                    />
                  </FormField>
                </div>
              </div>
            </EditorBlock>

            <EditorBlock title="Entradas">
              {types.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-white/45">
                  Todavía no hay tipos de entrada. Creá uno antes de emitir cortesías.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {types.map((type) => (
                    <QuantityRow
                      key={type.id}
                      name={type.name}
                      meta={type.isActive === false ? "Inactiva en la tienda" : undefined}
                      quantity={selectedTypes[type.id] ?? 0}
                      onDecrease={() => setTypeQty(type.id, (selectedTypes[type.id] ?? 0) - 1)}
                      onIncrease={() => setTypeQty(type.id, (selectedTypes[type.id] ?? 0) + 1)}
                    />
                  ))}
                </ul>
              )}
            </EditorBlock>

            {supportsConsumptions ? (
              <EditorBlock title="Tragos" description="Opcional. Se descuentan de la barra.">
                {menu.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-white/45">
                    No hay tragos activos en este evento.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {menu.map((product) => (
                      <QuantityRow
                        key={product.id}
                        name={product.name}
                        quantity={drinks[product.id] ?? 0}
                        onDecrease={() => setDrinkQty(product.id, (drinks[product.id] ?? 0) - 1)}
                        onIncrease={() => setDrinkQty(product.id, (drinks[product.id] ?? 0) + 1)}
                      />
                    ))}
                  </ul>
                )}
              </EditorBlock>
            ) : null}

            {supportsConsumptions ? (
              <EditorBlock
                title="Saldo de regalo"
                description="Opcional. Se acredita al DNI del invitado."
              >
                <div className="max-w-[240px]">
                  <FormField label="Importe" htmlFor="courtesy-balance">
                    <div className="relative">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-white/35"
                      >
                        $
                      </span>
                      <Input
                        id="courtesy-balance"
                        inputMode="decimal"
                        value={giftBalance}
                        onChange={(e) => setGiftBalance(e.target.value)}
                        placeholder="0"
                        className={cn(fieldInputClass, "pl-7 tabular-nums")}
                      />
                    </div>
                  </FormField>
                </div>
              </EditorBlock>
            ) : null}
          </fieldset>

          {formError ? (
            <p role="alert" className="text-[13px] leading-relaxed text-rose-300">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6">
            <p className="text-[12px] text-white/45" aria-live="polite">
              {ticketCount === 0
                ? "Elegí al menos una entrada"
                : `${ticketCount} ${ticketCount === 1 ? "entrada" : "entradas"}${drinkCount > 0 ? ` · ${drinkCount} ${drinkCount === 1 ? "trago" : "tragos"}` : ""}${Number(giftBalance.replace(",", ".")) > 0 ? ` · $ ${giftBalance} de saldo` : ""}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={closeCreate}
                className="h-10 rounded-xl px-4 text-white/60 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className={primaryButtonClass}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {saving ? "Creando…" : "Crear cortesía"}
              </Button>
            </div>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="w-full space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          Cortesías
          {!loading ? (
            <span className="text-[13px] font-medium text-white/45 tabular-nums">{courtesies.length}</span>
          ) : null}
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreating(true)}
          className="h-10 rounded-xl border-white/[0.14] bg-transparent px-4 text-white/80 hover:bg-white/[0.06] hover:text-white"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nueva cortesía
        </Button>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-4 py-3">
          <p role="alert" className="text-[13px] text-rose-300">
            {error}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            className="ml-auto h-8 rounded-lg px-2.5 text-white/60 hover:text-white"
          >
            Reintentar
          </Button>
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-2xl sm:block">
        {error && courtesies.length === 0 ? null : (
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
              <TableHead className={cn(headClass, "w-10 pl-4")}>Nº</TableHead>
              <TableHead className={cn(headClass, "pl-4")}>Invitado</TableHead>
              <TableHead className={headClass}>Entrada</TableHead>
              <TableHead className={headClass}>Estado</TableHead>
              <TableHead className={headClass}>Correo</TableHead>
              <TableHead className={cn(headClass, "pr-4 text-right")}>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-0 hover:bg-transparent">
                  <TableCell className="py-4 pl-4" colSpan={6}>
                    <div className="h-5 animate-pulse rounded-lg bg-white/[0.06]" />
                  </TableCell>
                </TableRow>
              ))
            ) : courtesies.length === 0 ? (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-[15px] text-white/50">
                  Todavía no hay cortesías
                </TableCell>
              </TableRow>
            ) : (
              courtesies.map((courtesy, index) => (
                <CourtesyLine
                  key={courtesy.id}
                  index={courtesies.length - index}
                  courtesy={courtesy}
                  typeName={typeName(courtesy.ticketTypeId)}
                  drinks={courtesy.drinkLines.map((line) => `${line.quantity}× ${productName(line.productId)}`).join(" · ")}
                  onRevoke={revoke}
                  onSend={sendInvite}
                />
              ))
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <div className="sm:hidden">
        {error && courtesies.length === 0 ? null : loading ? (
          <div className="space-y-3 border-y border-white/[0.06] py-4" aria-busy="true" aria-label="Cargando cortesías">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.06]" />
            ))}
          </div>
        ) : courtesies.length === 0 ? (
          <p className="border-y border-white/[0.06] py-12 text-center text-[14px] text-white/50">
            Todavía no hay cortesías
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {courtesies.map((courtesy) => {
              const revoked = courtesy.status === "REVOKED"
              const drinks = courtesy.drinkLines
                .map((line) => `${line.quantity}× ${productName(line.productId)}`)
                .join(" · ")
              return (
                <li key={courtesy.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("truncate text-[15px] font-medium", revoked ? "text-white/45" : "text-foreground")}>
                          {courtesy.guestName}
                        </p>
                        {courtesyStatusPill(courtesy.status)}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-white/50">
                        {typeName(courtesy.ticketTypeId)} · {courtesy.guestDni ?? "Sin DNI"}
                      </p>
                      {drinks ? (
                        <p className="mt-0.5 truncate text-[12px] text-white/50">{drinks}</p>
                      ) : null}
                      {courtesy.guestEmail ? (
                        <p className="mt-0.5 truncate text-[12px] text-white/45">
                          {courtesy.guestEmail}
                        </p>
                      ) : null}
                    </div>
                    <CourtesyActions courtesy={courtesy} onRevoke={revoke} onSend={sendInvite} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function CourtesyActions({ courtesy, onRevoke, onSend }: { courtesy: Courtesy; onRevoke: (id: string) => void; onSend: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const revoked = courtesy.status === "REVOKED"
  return (
    <div className="flex shrink-0 justify-end gap-1">
      {!revoked && courtesy.guestEmail ? (
        <button type="button" aria-label={`Enviar invitación a ${courtesy.guestName}`} onClick={() => onSend(courtesy.id)} className="rounded-lg p-2 text-white/40 hover:bg-white/[0.07] hover:text-white" title="Enviar invitación">
          <Send className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {!revoked && courtesy.status !== "REDEEMED" ? (
        <>
          <button
            type="button"
            aria-label={`Copiar link de ${courtesy.guestName}`}
            onClick={() => {
              void navigator.clipboard.writeText(getCourtesyUrl(courtesy.token))
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            className="rounded-lg p-2 text-white/40 hover:bg-white/[0.07] hover:text-white"
            title="Copiar link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button type="button" aria-label={`Anular cortesía de ${courtesy.guestName}`} onClick={() => onRevoke(courtesy.id)} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.07] hover:text-red-400" title="Anular">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  )
}

function CourtesyLine({ index, courtesy, typeName, drinks, onRevoke, onSend }: { index: number; courtesy: Courtesy; typeName: string; drinks: string; onRevoke: (id: string) => void; onSend: (id: string) => void }) {
  const revoked = courtesy.status === "REVOKED"
  return (
    <TableRow className="border-0 transition-colors duration-150 hover:bg-white/[0.03]">
      <TableCell className="py-3.5 pl-4 font-mono text-[12px] tabular-nums text-zinc-600">
        {index}
      </TableCell>
      <TableCell className="py-3.5 pl-4">
        <p className={cn("truncate text-[15px] font-medium", revoked ? "text-white/45" : "text-foreground")}>{courtesy.guestName}</p>
        <p className="truncate text-[12px] text-white/50">
          {courtesy.guestDni ?? "Sin DNI"}{drinks ? ` · ${drinks}` : ""}
        </p>
      </TableCell>
      <TableCell className={cn("py-3.5 text-[15px]", revoked ? "text-white/30" : "text-white/50")}>{typeName}</TableCell>
      <TableCell className="py-3.5">{courtesyStatusPill(courtesy.status)}</TableCell>
      <TableCell className="py-3.5 text-[13px] text-white/45">{courtesy.guestEmail ?? "—"}</TableCell>
      <TableCell className="py-3.5 pr-4">
        <CourtesyActions courtesy={courtesy} onRevoke={onRevoke} onSend={onSend} />
      </TableCell>
    </TableRow>
  )
}
