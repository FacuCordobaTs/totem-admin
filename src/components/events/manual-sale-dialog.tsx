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
import { ShoppingBag } from "lucide-react"

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

const inputClass =
  "h-11 rounded-xl border border-zinc-200/50 bg-[#F2F2F7] px-4 text-[17px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-black dark:text-white"

const selectClass =
  "h-11 w-full rounded-xl border border-zinc-200/50 bg-[#F2F2F7] px-4 text-[17px] dark:border-zinc-800/50 dark:bg-black dark:text-white"

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
    selected != null && selected.stockLimit != null && selected.sold >= selected.stockLimit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[min(92vh,880px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-background p-0 sm:max-w-lg dark:border-zinc-800/50"
      >
        <div className="border-b border-zinc-200/50 px-5 py-5 dark:border-zinc-800/50">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
              <ShoppingBag className="h-6 w-6 text-[#FF9500]" />
            </span>
            <DialogHeader className="flex-1 gap-1 text-left">
              <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
                Venta manual
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                Simulación de cobro: se emite la entrada con hash QR único (sin Mercado
                Pago).
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex max-h-[calc(92vh-14rem)] flex-col overflow-y-auto"
        >
          <div className="space-y-5 px-5 py-5">
            {error ? (
              <p
                className="rounded-xl border border-red-200/50 bg-red-500/10 px-4 py-3 text-[15px] text-red-600 dark:border-red-900/50 dark:text-red-400"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <span className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                Tipo de entrada
              </span>
              {loadingTypes ? (
                <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">Cargando…</p>
              ) : types.length === 0 ? (
                <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                  Creá al menos un tipo de entrada antes de vender.
                </p>
              ) : (
                <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
                  <SelectTrigger className={selectClass}>
                    <SelectValue placeholder="Elegí tipo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                    {types.map((t) => {
                      const out = t.stockLimit != null && t.sold >= t.stockLimit
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
              <label
                className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
                htmlFor="buyer-name"
              >
                Nombre del comprador
              </label>
              <Input
                id="buyer-name"
                className={inputClass}
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
                htmlFor="buyer-email"
              >
                Correo
              </label>
              <Input
                id="buyer-email"
                type="email"
                className={inputClass}
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {soldOut ? (
              <p className="text-[15px] text-amber-600 dark:text-amber-400">
                Este tipo está agotado. Elegí otro.
              </p>
            ) : null}
          </div>

          <div className="mt-auto border-t border-zinc-200/50 bg-[#F2F2F7]/80 p-4 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 max-sm:sticky max-sm:bottom-0">
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-[#FF9500] text-[17px] font-semibold text-white transition-all duration-200 active:opacity-70"
                disabled={
                  selling || loadingTypes || types.length === 0 || !ticketTypeId || soldOut
                }
              >
                {selling ? "Emitiendo…" : "Confirmar venta"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl border-zinc-200/50 text-[17px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
