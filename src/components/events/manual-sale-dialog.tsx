import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiTicketType } from "./ticket-types"

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

type SellResponse = {
  message: string
  ticket: {
    id: string
    qrHash: string
    status: string
    buyerName: string | null
    buyerEmail: string | null
  }
  ticketTypeName: string
  payment: { status: string; method: string }
}

type ManualSaleDialogProps = {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSold: () => void
}

export function ManualSaleDialog({
  eventId,
  open,
  onOpenChange,
  onSold,
}: ManualSaleDialogProps) {
  const token = useAuthStore((s) => s.token)

  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [ticketTypeId, setTicketTypeId] = useState<string>("")
  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [selling, setSelling] = useState(false)

  useEffect(() => {
    if (!open || !token) return
    setLoadingTypes(true)
    setError(null)
    apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
      method: "GET",
      token,
    })
      .then((data) => {
        setTypes(data.ticketTypes)
        const first = data.ticketTypes[0]
        setTicketTypeId(first?.id ?? "")
      })
      .catch((err) => {
        setTypes([])
        setError(err instanceof ApiError ? err.message : "Error al cargar tipos")
      })
      .finally(() => setLoadingTypes(false))
  }, [open, eventId, token])

  useEffect(() => {
    if (!open) {
      setBuyerName("")
      setBuyerEmail("")
      setError(null)
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !ticketTypeId) return
    setError(null)
    setSelling(true)
    try {
      await apiFetch<SellResponse>("/tickets/sell", {
        method: "POST",
        token,
        body: JSON.stringify({
          eventId,
          ticketTypeId,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
        }),
      })
      onOpenChange(false)
      onSold()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la venta")
    } finally {
      setSelling(false)
    }
  }

  const selected = types.find((t) => t.id === ticketTypeId)
  const soldOut =
    selected != null &&
    selected.stockLimit != null &&
    selected.sold >= selected.stockLimit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Venta manual</DialogTitle>
          <DialogDescription>
            Simulación de cobro: se emite la entrada con hash QR único (sin Mercado Pago).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Tipo de entrada</span>
            {loadingTypes ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : types.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Creá al menos un tipo de entrada antes de vender.
              </p>
            ) : (
              <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
                <SelectTrigger className="h-12 w-full border-border bg-secondary text-base">
                  <SelectValue placeholder="Elegí tipo" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => {
                    const out =
                      t.stockLimit != null && t.sold >= t.stockLimit
                    return (
                      <SelectItem key={t.id} value={t.id} disabled={out}>
                        {t.name} — ${Number(t.price).toFixed(2)}
                        {out ? " (agotado)" : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="buyer-name">
              Nombre del comprador
            </label>
            <Input
              id="buyer-name"
              className="h-12 bg-secondary text-base"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="buyer-email">
              Correo
            </label>
            <Input
              id="buyer-email"
              type="email"
              className="h-12 bg-secondary text-base"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {soldOut ? (
            <p className="text-sm text-amber-500">Este tipo está agotado. Elegí otro.</p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 min-w-[100px]"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-12 min-w-[140px] text-base font-semibold"
              disabled={
                selling ||
                loadingTypes ||
                types.length === 0 ||
                !ticketTypeId ||
                soldOut
              }
            >
              {selling ? "Emitiendo…" : "Confirmar venta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
