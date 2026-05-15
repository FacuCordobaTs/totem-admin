import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

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
  /** Tarjetas compactas en grilla para el canvas de Entradas */
  layout?: "default" | "compact"
}

const inputClass =
  "h-11 rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 text-[17px] transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

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

export function TicketTypes({
  eventId,
  refreshTrigger,
  onChanged,
  layout = "default",
}: TicketTypesProps) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManageTypes = role === "ADMIN" || role === "MANAGER"

  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [stockLimit, setStockLimit] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setFormError(null)
    const p = Number(price.replace(",", "."))
    if (Number.isNaN(p) || p < 0) {
      setFormError("Precio inválido")
      return
    }
    let limit: number | null | undefined
    if (stockLimit.trim() !== "") {
      const n = parseInt(stockLimit, 10)
      if (Number.isNaN(n) || n < 1) {
        setFormError("Stock debe ser un entero positivo o vacío (ilimitado)")
        return
      }
      limit = n
    } else {
      limit = null
    }
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types`, {
        method: "POST",
        token,
        body: JSON.stringify({
          name: name.trim(),
          price: p,
          stockLimit: limit,
        }),
      })
      setOpen(false)
      setName("")
      setPrice("")
      setStockLimit("")
      await load()
      onChanged?.()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo crear el tipo")
    } finally {
      setSaving(false)
    }
  }

  const isCompact = layout === "compact"

  function CompactTypeCard({ ticket }: { ticket: ApiTicketType }) {
    const limit = ticket.stockLimit
    const sold = ticket.sold
    const total = limit ?? Math.max(sold, 1)
    const percentage =
      limit == null ? (sold > 0 ? 100 : 0) : Math.min(100, (sold / total) * 100)
    const isSoldOut = limit != null && sold >= limit
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-black dark:text-white">
            {ticket.name}
          </h3>
          {isSoldOut ? (
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              Agotado
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[14px] font-medium text-foreground">
          {formatTicketPrice(ticket.price)}
        </p>
        <div className="mt-2 w-full">
          <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            <span>{limit == null ? `${sold} emitidas · sin límite` : `${sold} / ${limit}`}</span>
            {limit != null ? <span>{percentage.toFixed(0)}%</span> : null}
          </div>
          <Progress
            value={limit == null ? (sold > 0 ? 100 : 8) : percentage}
            className="h-1.5 overflow-hidden rounded-full bg-white/10 [&>div]:rounded-full [&>div]:bg-white/50"
          />
        </div>
      </>
    )
  }

  return (
    <section className={cn(isCompact && "w-full")}>
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center justify-between gap-3",
          isCompact && "mb-3"
        )}
      >
        <h2
          className={cn(
            "font-medium tracking-tight text-foreground",
            isCompact ? "text-2xl" : "text-2xl"
          )}
        >
          Tipos de entrada
        </h2>
        {canManageTypes ? (
          <Button
            type="button"
            onClick={() => {
              setFormError(null)
              setOpen(true)
            }}
            className="h-10 shrink-0 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Añadir tipo
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "rounded-2xl",
          isCompact ? "mt-0" : "mt-4"
        )}
      >
        {error ? (
          <p className="border-b border-white/[0.06] p-4 text-[15px] text-red-400">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="p-4 text-[15px] text-[#8E8E93] dark:text-[#98989D]">Cargando tipos…</p>
        ) : types.length === 0 ? (
          <p className="p-4 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            No hay tipos de entrada. Añadí al menos uno para vender en boletería.
          </p>
        ) : isCompact ? (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {types.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-xl p-3"
              >
                <CompactTypeCard ticket={ticket} />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {types.map((ticket) => {
              const limit = ticket.stockLimit
              const sold = ticket.sold
              const total = limit ?? Math.max(sold, 1)
              const percentage =
                limit == null ? (sold > 0 ? 100 : 0) : Math.min(100, (sold / total) * 100)
              const isSoldOut = limit != null && sold >= limit
              return (
                <div
                  key={ticket.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1 pl-0 sm:pl-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-semibold tracking-tight text-black dark:text-white">
                        {ticket.name}
                      </h3>
                      {isSoldOut ? (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                          Agotado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[15px] font-medium text-foreground">
                      {formatTicketPrice(ticket.price)}
                    </p>
                  </div>
                  <div className="w-full sm:w-44">
                    <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                      <span>
                        {limit == null ? `${sold} emitidas · sin límite` : `${sold} / ${limit}`}
                      </span>
                      {limit != null ? <span>{percentage.toFixed(0)}%</span> : null}
                    </div>
                    <Progress
                      value={limit == null ? (sold > 0 ? 100 : 8) : percentage}
                      className="h-1.5 overflow-hidden rounded-full bg-white/10 [&>div]:rounded-full [&>div]:bg-white/50"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-h-[min(90vh,800px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-lg"
        >
          <div className="border-b border-white/[0.06] px-5 py-5">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
                <Plus className="h-6 w-6 text-white/30" />
              </span>
              <DialogHeader className="flex-1 gap-1 text-left sm:text-left">
                <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
                  Nuevo tipo de entrada
                </DialogTitle>
                <DialogDescription className="text-[15px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                  Definí precio y, si querés, un tope de stock (vacío = ilimitado).
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="flex max-h-[calc(90vh-12rem)] flex-col overflow-y-auto"
          >
            <div className="space-y-5 px-5 py-5">
              {formError ? (
                <p className="text-[15px] text-red-600 dark:text-red-400" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="space-y-2">
                <label
                  className="text-[13px] font-normal text-white/45"
                  htmlFor="tt-name"
                >
                  Nombre
                </label>
                <Input
                  id="tt-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="General, VIP…"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-[13px] font-normal text-white/45"
                  htmlFor="tt-price"
                >
                  Precio
                </label>
                <Input
                  id="tt-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-[13px] font-normal text-white/45"
                  htmlFor="tt-stock"
                >
                  Tope de stock (opcional)
                </label>
                <Input
                  id="tt-stock"
                  inputMode="numeric"
                  value={stockLimit}
                  onChange={(e) => setStockLimit(e.target.value)}
                  className={inputClass}
                  placeholder="Vacío = ilimitado"
                />
              </div>
            </div>

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
                  onClick={() => setOpen(false)}
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
