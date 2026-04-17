import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { QrCode } from "lucide-react"

type QrResponse = {
  qrDataUrl: string
  qrHash: string
}

function safeTicketFilename(buyerName: string | null): string {
  const raw = (buyerName?.trim() || "entrada")
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80)
  const base = raw.length > 0 ? raw : "entrada"
  return `ticket-${base}.png`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",")
  const meta = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] ?? "image/png"
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

type TicketQrDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketId: string | null
  buyerName: string | null
  token: string | null
}

export function TicketQrDialog({
  open,
  onOpenChange,
  ticketId,
  buyerName,
  token,
}: TicketQrDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<QrResponse | null>(null)

  useEffect(() => {
    if (!open || !ticketId || !token) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setData(null)
    apiFetch<QrResponse>(`/tickets/${ticketId}/qr`, { method: "GET", token })
      .then(setData)
      .catch((err) => {
        setData(null)
        setError(err instanceof ApiError ? err.message : "No se pudo cargar el QR")
      })
      .finally(() => setLoading(false))
  }, [open, ticketId, token])

  function downloadPng() {
    if (!data?.qrDataUrl) return
    const blob = dataUrlToBlob(data.qrDataUrl)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = safeTicketFilename(buyerName)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[min(92vh,840px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-background p-0 sm:max-w-md dark:border-zinc-800/50"
      >
        <div className="border-b border-zinc-200/50 px-5 py-5 dark:border-zinc-800/50">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
              <QrCode className="h-6 w-6 text-[#FF9500]" />
            </span>
            <DialogHeader className="flex-1 gap-1 text-left">
              <DialogTitle className="text-[20px] font-bold tracking-tight text-black dark:text-white">
                Código QR de la entrada
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                Compartilo por WhatsApp o correo. El código contiene el identificador de
                la entrada.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 px-5 py-6">
          {loading ? (
            <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">Generando…</p>
          ) : error ? (
            <p className="text-center text-[15px] text-red-600 dark:text-red-400">{error}</p>
          ) : data ? (
            <>
              <div className="rounded-xl border border-zinc-200/50 bg-white p-3 dark:border-zinc-800/50 dark:bg-black">
                <img
                  src={data.qrDataUrl}
                  alt="Código QR de la entrada"
                  className="h-56 w-56 max-w-full object-contain"
                  width={224}
                  height={224}
                />
              </div>
              <p className="max-w-full truncate text-center font-mono text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                {data.qrHash}
              </p>
            </>
          ) : null}
        </div>

        <div className="border-t border-zinc-200/50 bg-[#F2F2F7]/80 p-4 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              disabled={!data?.qrDataUrl}
              onClick={downloadPng}
              className="h-11 w-full rounded-xl bg-[#FF9500] text-[17px] font-semibold text-white transition-all duration-200 active:opacity-70"
            >
              Descargar PNG
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 w-full rounded-xl border-zinc-200/50 text-[17px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
