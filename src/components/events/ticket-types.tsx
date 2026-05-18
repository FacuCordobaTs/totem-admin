import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Pencil, Plus } from "lucide-react"

export type ApiTicketType = {
  id: string
  eventId: string
  tenantId: string
  name: string
  price: string
  stockLimit: number | null
  sold: number
  remaining: number | null
}

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

type TicketTypesProps = {
  eventId: string
  refreshTrigger: number
  onChanged?: () => void
  layout?: "default" | "compact"
}

const inputClass =
  "h-11 rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 text-[15px] transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

function formatTicketPrice(price: string | number): string {
  const n = typeof price === "string" ? Number.parseFloat(price) : price
  if (Number.isNaN(n)) return "—"
  return (
    "$ " +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n))
  )
}

function TicketFormFields({
  name,
  price,
  stockLimit,
  onName,
  onPrice,
  onStockLimit,
  error,
}: {
  name: string
  price: string
  stockLimit: string
  onName: (v: string) => void
  onPrice: (v: string) => void
  onStockLimit: (v: string) => void
  error: string | null
}) {
  return (
    <div className="space-y-5 px-5 py-5">
      {error ? (
        <p className="text-[15px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        <label className="text-[13px] font-normal text-white/45" htmlFor="tt-name">
          nombre
        </label>
        <Input
          id="tt-name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          required
          className={inputClass}
          placeholder="General, VIP…"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[13px] font-normal text-white/45" htmlFor="tt-price">
          precio
        </label>
        <Input
          id="tt-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          required
          className={inputClass}
          placeholder="0"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[13px] font-normal text-white/45" htmlFor="tt-stock">
          tope de stock (opcional)
        </label>
        <Input
          id="tt-stock"
          inputMode="numeric"
          value={stockLimit}
          onChange={(e) => onStockLimit(e.target.value)}
          className={inputClass}
          placeholder="vacío = ilimitado"
        />
      </div>
    </div>
  )
}

export function TicketTypes({
  eventId,
  refreshTrigger,
  onChanged,
}: TicketTypesProps) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManageTypes = role === "ADMIN" || role === "MANAGER"

  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [stockLimit, setStockLimit] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<ApiTicketType | null>(null)
  const [editName, setEditName] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editStockLimit, setEditStockLimit] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<TicketTypesResponse>(
        `/events/${eventId}/ticket-types`,
        { method: "GET", token }
      )
      setTypes(data.ticketTypes)
    } catch (err) {
      setTypes([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los tipos")
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  function openCreate() {
    setFormError(null)
    setName("")
    setPrice("")
    setStockLimit("")
    setCreateOpen(true)
  }

  function openEdit(ticket: ApiTicketType) {
    setEditError(null)
    setEditName(ticket.name)
    setEditPrice(String(Number.parseFloat(ticket.price)))
    setEditStockLimit(ticket.stockLimit != null ? String(ticket.stockLimit) : "")
    setEditTarget(ticket)
  }

  function parseFormValues(p: string, sl: string): { price: number; limit: number | null; err: string | null } {
    const parsedPrice = Number(p.replace(",", "."))
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) return { price: 0, limit: null, err: "Precio inválido" }
    let limit: number | null = null
    if (sl.trim() !== "") {
      const n = parseInt(sl, 10)
      if (Number.isNaN(n) || n < 1) return { price: 0, limit: null, err: "Stock debe ser un entero positivo o vacío (ilimitado)" }
      limit = n
    }
    return { price: parsedPrice, limit, err: null }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setFormError(null)
    const { price: p, limit, err } = parseFormValues(price, stockLimit)
    if (err) { setFormError(err); return }
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types`, {
        method: "POST",
        token,
        body: JSON.stringify({ name: name.trim(), price: p, stockLimit: limit }),
      })
      setCreateOpen(false)
      await load()
      onChanged?.()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo crear el tipo")
    } finally {
      setSaving(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !editTarget) return
    setEditError(null)
    const { price: p, limit, err } = parseFormValues(editPrice, editStockLimit)
    if (err) { setEditError(err); return }
    setEditSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${editTarget.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name: editName.trim(), price: p, stockLimit: limit }),
      })
      setEditTarget(null)
      await load()
      onChanged?.()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "No se pudieron guardar los cambios")
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <section className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-medium tracking-tight text-foreground">
          Tipos de entrada
        </h2>
        {canManageTypes ? (
          <Button
            type="button"
            onClick={openCreate}
            className="h-9 shrink-0 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Añadir tipo
          </Button>
        ) : null}
      </div>

      <div>
        {error ? (
          <p className="py-3 text-[15px] text-red-400">{error}</p>
        ) : loading ? (
          <p className="py-3 text-[15px] text-white/40">Cargando tipos…</p>
        ) : types.length === 0 ? (
          <p className="py-3 text-[15px] text-white/40">
            No hay tipos de entrada. Añadí al menos uno para vender en boletería.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {types.map((ticket) => {
              const limit = ticket.stockLimit
              const sold = ticket.sold
              const stockText =
                limit == null
                  ? `${sold} vendidas`
                  : `${sold} / ${limit}`
              return (
                <div
                  key={ticket.id}
                  className="flex items-center gap-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[16px] font-medium text-foreground">
                        {ticket.name}
                      </span>
                      <span className="text-[14px] text-white/50">
                        {formatTicketPrice(ticket.price)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-white/35">
                      {stockText}
                    </p>
                  </div>
                  {canManageTypes ? (
                    <button
                      type="button"
                      onClick={() => openEdit(ticket)}
                      className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:text-white/60"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          showCloseButton
          className="max-h-[min(90vh,800px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-lg"
        >
          <div className="border-b border-white/[0.06] px-5 py-5">
            <DialogHeader className="gap-1 text-left sm:text-left">
              <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
                Nuevo tipo de entrada
              </DialogTitle>
            </DialogHeader>
          </div>
          <form
            onSubmit={submitCreate}
            className="flex max-h-[calc(90vh-10rem)] flex-col overflow-y-auto"
          >
            <TicketFormFields
              name={name}
              price={price}
              stockLimit={stockLimit}
              onName={setName}
              onPrice={setPrice}
              onStockLimit={setStockLimit}
              error={formError}
            />
            <div className="mt-auto border-t border-white/[0.06] bg-black/40 p-4">
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-11 w-full rounded-xl bg-[#FF9500] text-[17px] font-semibold text-white transition-all duration-200 active:opacity-70"
                >
                  {saving ? "Guardando…" : "Crear tipo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="h-11 w-full rounded-xl border-white/[0.15] bg-transparent text-[17px] font-semibold text-white/70 transition-all duration-200 hover:border-white/25 active:opacity-50"
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) setEditTarget(null) }}>
        <DialogContent
          showCloseButton
          className="max-h-[min(90vh,800px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-lg"
        >
          <div className="border-b border-white/[0.06] px-5 py-5">
            <DialogHeader className="gap-1 text-left sm:text-left">
              <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
                Editar tipo
              </DialogTitle>
            </DialogHeader>
          </div>
          <form
            onSubmit={submitEdit}
            className="flex max-h-[calc(90vh-10rem)] flex-col overflow-y-auto"
          >
            <TicketFormFields
              name={editName}
              price={editPrice}
              stockLimit={editStockLimit}
              onName={setEditName}
              onPrice={setEditPrice}
              onStockLimit={setEditStockLimit}
              error={editError}
            />
            <div className="mt-auto border-t border-white/[0.06] bg-black/40 p-4">
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  type="submit"
                  disabled={editSaving}
                  className="h-11 w-full rounded-xl bg-[#FF9500] text-[17px] font-semibold text-white transition-all duration-200 active:opacity-70"
                >
                  {editSaving ? "Guardando…" : "Guardar cambios"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditTarget(null)}
                  className="h-11 w-full rounded-xl border-white/[0.15] bg-transparent text-[17px] font-semibold text-white/70 transition-all duration-200 hover:border-white/25 active:opacity-50"
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
