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
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Código QR de la entrada</DialogTitle>
          <DialogDescription>
            Compartilo por WhatsApp o correo. El código contiene el identificador de la entrada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Generando…</p>
          ) : error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : data ? (
            <>
              <div className="rounded-xl border border-border bg-white p-3 shadow-inner">
                <img
                  src={data.qrDataUrl}
                  alt="Código QR de la entrada"
                  className="h-56 w-56 max-w-full object-contain"
                  width={224}
                  height={224}
                />
              </div>
              <p className="max-w-full truncate text-center font-mono text-xs text-muted-foreground">
                {data.qrHash}
              </p>
            </>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!data?.qrDataUrl}
            onClick={downloadPng}
          >
            Descargar PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
