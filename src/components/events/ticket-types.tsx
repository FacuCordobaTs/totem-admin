import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}

export function TicketTypes({ eventId, refreshTrigger, onChanged }: TicketTypesProps) {
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

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-medium">Tipos de entrada</CardTitle>
        {canManageTypes ? (
          <Button
            size="sm"
            type="button"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setFormError(null)
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Añadir tipo
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando tipos…</p>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay tipos de entrada. Añadí al menos uno para vender en boletería.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
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
                  className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4 transition-colors sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{ticket.name}</h3>
                      {isSoldOut ? (
                        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                          Agotado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      ${Number(ticket.price).toFixed(2)}
                    </p>
                  </div>

                  <div className="w-full sm:w-40">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {limit == null ? `${sold} emitidas` : `${sold}/${limit}`}
                      </span>
                      <span className="text-muted-foreground">
                        {limit == null ? "∞" : `${percentage.toFixed(0)}%`}
                      </span>
                    </div>
                    <Progress
                      value={limit == null ? (sold > 0 ? 100 : 8) : percentage}
                      className="h-1.5 bg-secondary [&>div]:bg-primary"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo tipo de entrada</DialogTitle>
            <DialogDescription>
              Definí precio y, si querés, un tope de stock (vacío = ilimitado).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tt-name">
                Nombre
              </label>
              <Input
                id="tt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-secondary/50"
                placeholder="General, VIP…"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tt-price">
                Precio
              </label>
              <Input
                id="tt-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="bg-secondary/50"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tt-stock">
                Tope de stock (opcional)
              </label>
              <Input
                id="tt-stock"
                inputMode="numeric"
                value={stockLimit}
                onChange={(e) => setStockLimit(e.target.value)}
                className="bg-secondary/50"
                placeholder="Vacío = ilimitado"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Crear tipo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
