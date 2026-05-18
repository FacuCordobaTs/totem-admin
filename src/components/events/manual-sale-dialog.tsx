import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiTicketType } from "./ticket-types"
import { cn } from "@/lib/utils"

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

function formatPrice(price: string | number): string {
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

const inputClass =
  "rounded-xl border border-white/[0.1] bg-white/[0.05] py-3 px-4 text-[15px] h-auto transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

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
        const first = data.ticketTypes.find(
          (t) => t.stockLimit == null || t.sold < t.stockLimit
        )
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
      setTicketTypeId("")
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
        className="max-h-[min(92vh,680px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-[480px]"
      >
        <div className="border-b border-white/[0.06] px-5 py-5">
          <DialogHeader className="gap-0 text-left sm:text-left">
            <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
              Nueva venta
            </DialogTitle>
          </DialogHeader>
        </div>

        <form
          onSubmit={submit}
          className="flex max-h-[calc(92vh-10rem)] flex-col overflow-y-auto"
        >
          <div className="space-y-6 px-5 py-5">
            {error ? (
              <p
                className="rounded-xl border border-red-900/50 bg-red-500/10 px-4 py-3 text-[15px] text-red-400"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="space-y-2">
              <span className="text-[13px] font-normal text-white/45">
                tipo de entrada
              </span>
              {loadingTypes ? (
                <p className="pt-1 text-[15px] text-white/40">Cargando…</p>
              ) : types.length === 0 ? (
                <p className="pt-1 text-[15px] text-white/40">
                  Creá al menos un tipo de entrada antes de vender.
                </p>
              ) : (
                <div
                  className="mt-2 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.08]"
                  style={{ maxHeight: types.length > 4 ? "232px" : undefined }}
                >
                  {types.map((t) => {
                    const isSoldOut = t.stockLimit != null && t.sold >= t.stockLimit
                    const isSelected = ticketTypeId === t.id
                    const stockText =
                      t.stockLimit == null
                        ? "sin límite"
                        : isSoldOut
                          ? "agotado"
                          : `${t.remaining ?? t.stockLimit - t.sold} disponibles`
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => setTicketTypeId(t.id)}
                        className={cn(
                          "flex w-full items-start justify-between border-l-2 px-4 py-3.5 text-left transition-colors",
                          isSelected
                            ? "border-l-[#FF9500] bg-[#FF9500]/[0.06]"
                            : "border-l-transparent hover:bg-white/[0.03]",
                          isSoldOut && "opacity-40"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-[16px] font-medium text-foreground">
                            {t.name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-white/40">
                            {stockText}
                          </p>
                        </div>
                        <span className="ml-4 shrink-0 text-[15px] text-white/60">
                          {formatPrice(t.price)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label
                className="text-[13px] font-normal text-white/45"
                htmlFor="buyer-name"
              >
                nombre del comprador
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
                className="text-[13px] font-normal text-white/45"
                htmlFor="buyer-email"
              >
                correo
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
          </div>

          <div className="mt-auto border-t border-white/[0.06] bg-black/40 px-5 py-4">
            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-[#FF9500] text-[16px] font-semibold text-white transition-all duration-200 active:opacity-70"
              disabled={
                selling || loadingTypes || types.length === 0 || !ticketTypeId || soldOut
              }
            >
              {selling ? "Emitiendo…" : "Confirmar venta"}
            </Button>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-[15px] text-white/40 transition-colors hover:text-white/60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
