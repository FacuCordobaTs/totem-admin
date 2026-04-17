import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { Receipt } from "lucide-react"

export type SaleDetailApiResponse = {
  sale: {
    id: string
    totalAmount: string
    paymentMethod: "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER"
    createdAt: string | null
    source: "POS" | "APP" | "WEB"
    status: "COMPLETED" | "REFUNDED" | null
    staffName: string | null
    customerName: string | null
  }
  items: {
    productName: string
    quantity: number
    priceAtTime: string
    lineSubtotal: string
  }[]
}

function formatPaymentLabel(
  p: SaleDetailApiResponse["sale"]["paymentMethod"]
): string {
  switch (p) {
    case "CASH":
      return "Efectivo"
    case "CARD":
      return "Tarjeta"
    case "MERCADOPAGO":
      return "Mercado Pago"
    case "TRANSFER":
      return "Transferencia"
    default:
      return String(p)
  }
}

function formatDetailTimestamp(createdAt: string | null): string {
  if (createdAt == null) return "—"
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function shortSaleId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

type Props = {
  saleId: string | null
  token: string | null
  onClose: () => void
}

export function SaleDetailsDialog({ saleId, token, onClose }: Props) {
  const open = saleId != null && saleId.length > 0
  const [data, setData] = useState<SaleDetailApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !token || !saleId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setData(null)

    void (async () => {
      try {
        const res = await apiFetch<SaleDetailApiResponse>(`/sales/${saleId}`, {
          method: "GET",
          token,
          signal: ac.signal,
        })
        if (!ac.signal.aborted) {
          setData(res)
        }
      } catch (e) {
        if (ac.signal.aborted) return
        if (e instanceof DOMException && e.name === "AbortError") return
        const msg =
          e instanceof ApiError ? e.message : "No se pudo cargar el detalle"
        setError(msg)
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [open, saleId, token])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton
        className="max-h-[min(92vh,880px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-[32px] border border-zinc-100 bg-white p-0 shadow-xl shadow-zinc-200/40 sm:max-w-lg dark:border-zinc-800 dark:bg-[#121212] dark:shadow-none"
      >
        <div className="border-b border-zinc-100 p-8 pb-6 dark:border-zinc-800">
          <div className="flex gap-5 pr-8">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40">
              <Receipt className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            </span>
            <DialogHeader className="flex-1 gap-2 text-left">
              <DialogTitle className="text-2xl font-black tracking-tighter text-zinc-950 dark:text-white">
                {data
                  ? `Venta #${shortSaleId(data.sale.id)}`
                  : saleId
                    ? `Venta #${shortSaleId(saleId)}`
                    : "Detalle de venta"}
              </DialogTitle>
              {data ? (
                <p className="text-base text-zinc-500 dark:text-zinc-400">
                  {formatDetailTimestamp(
                    data.sale.createdAt == null
                      ? null
                      : typeof data.sale.createdAt === "string"
                        ? data.sale.createdAt
                        : String(data.sale.createdAt)
                  )}
                </p>
              ) : loading ? (
                <p className="text-base text-zinc-500 dark:text-zinc-400">Cargando…</p>
              ) : null}
            </DialogHeader>
          </div>
        </div>

        <div className="max-h-[calc(92vh-14rem)] overflow-y-auto px-8 py-6">
          {loading && !data ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/80"
                />
              ))}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-base text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : data ? (
            <div className="space-y-6">
              <div className="overflow-hidden rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <span>Cant.</span>
                  <span>Producto</span>
                  <span className="text-right">Subtotal</span>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.items.length === 0 ? (
                    <li className="px-4 py-8 text-center text-base text-zinc-500 dark:text-zinc-400">
                      Sin ítems
                    </li>
                  ) : (
                    data.items.map((line, idx) => (
                      <li
                        key={`${line.productName}-${idx}`}
                        className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 px-4 py-3 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                      >
                        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                          {line.quantity}
                        </span>
                        <span className="min-w-0 font-semibold leading-snug text-zinc-950 dark:text-white">
                          {line.productName}
                        </span>
                        <span className="text-right font-mono tabular-nums font-bold text-zinc-950 dark:text-white">
                          ${Number.parseFloat(line.lineSubtotal).toFixed(2)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  Total
                </span>
                <span className="text-2xl font-black tabular-nums tracking-tight text-zinc-950 dark:text-white">
                  ${Number.parseFloat(data.sale.totalAmount).toFixed(2)}
                </span>
              </div>

              <div className="space-y-3 border-t border-zinc-100 pt-6 text-base dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold uppercase tracking-wider text-xs text-zinc-500 dark:text-zinc-400">
                    Cobrado por{" "}
                  </span>
                  <span className="font-bold text-zinc-950 dark:text-white">
                    {data.sale.staffName ?? "—"}
                  </span>
                </p>
                {data.sale.customerName ? (
                  <p className="text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold uppercase tracking-wider text-xs">
                      Cliente{" "}
                    </span>
                    <span className="font-bold text-zinc-950 dark:text-white">
                      {data.sale.customerName}
                    </span>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    Método
                  </span>
                  <span className="inline-flex rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {formatPaymentLabel(data.sale.paymentMethod)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/95 p-6 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-14 w-full rounded-2xl border-zinc-200 text-base font-semibold transition-all duration-300 active:scale-[0.98] dark:border-zinc-700"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
