import { useCallback, useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Flashlight, Smartphone, ScanLine, Package, Check } from "lucide-react"
import { playScannerSound } from "@/lib/scanner-sound"
import { usePrinter } from "@/context/PrinterContext"
import { commandsToBytes, formatPedidoEntregado } from "@/lib/printerUtils"

function playSuccessBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.value = 0.12
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    osc.onended = () => void ctx.close().catch(() => {})
  } catch {
    /* no audio */
  }
}

type OverlayState =
  | { kind: "none" }
  | { kind: "success"; productName: string }
  | { kind: "error"; message: string }

type Phase = "choose" | "scanning" | "order"

/** Item agrupado por producto tal como lo responde el backend (4.2). */
type PickupOrderItem = { productId: string; productName: string; quantity: number }

/** Pedido de retiro (GET /bars/:barId/pickups/:token). */
type PickupOrderView = {
  token: string
  status: "PENDING" | "DELIVERED" | "CANCELLED"
  items: PickupOrderItem[]
}

/** Respuesta de POST /bars/:barId/pickups/:token/deliver. */
type DeliverResponse = {
  ok: boolean
  items: PickupOrderItem[]
  totalAmount?: string
}

export type PosScannerModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  barId: string | null
  token: string | null
  /** Para el ticket impreso del pedido entregado (opcional). */
  eventName?: string | null
  barName?: string | null
}

export function PosScannerModal({
  open,
  onOpenChange,
  barId,
  token,
  eventName,
  barName,
}: PosScannerModalProps) {
  const [phase, setPhase] = useState<Phase>("choose")
  const [torchDesired, setTorchDesired] = useState(false)
  const [overlay, setOverlay] = useState<OverlayState>({ kind: "none" })
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Pedido de retiro (4.3): el QR escaneado era un pedido → ver lista, entregar.
  const [order, setOrder] = useState<PickupOrderView | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [deliveredSummary, setDeliveredSummary] = useState<{
    items: PickupOrderItem[]
    totalAmount?: string
  } | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const readerIdRef = useRef(`pos-scanner-${Math.random().toString(36).slice(2, 11)}`)
  const isProcessingRef = useRef(false)
  const tokenRef = useRef(token)
  const barIdRef = useRef(barId)

  const { selectedPrinter, printRaw } = usePrinter()

  tokenRef.current = token
  barIdRef.current = barId

  const resetToChoose = useCallback(() => {
    setPhase("choose")
    setTorchDesired(false)
    setCameraError(null)
    setOverlay({ kind: "none" })
    setOrder(null)
    setDelivering(false)
    setDeliveredSummary(null)
    isProcessingRef.current = false
  }, [])

  useEffect(() => {
    if (!open) {
      resetToChoose()
    }
  }, [open, resetToChoose])

  // Canje 1×1: mismo mecanismo que antes de los pedidos (QR individual del receipt).
  const redeemSingle = useCallback(async (qrHash: string) => {
    const t = tokenRef.current
    const b = barIdRef.current
    if (!t || !b) return
    try {
      const res = await apiFetch<{ productName: string }>(`/bars/${b}/redeem`, {
        method: "POST",
        token: t,
        body: JSON.stringify({ qrHash }),
      })
      playSuccessBeep()
      setOverlay({ kind: "success", productName: res.productName })
      window.setTimeout(() => {
        setOverlay({ kind: "none" })
        isProcessingRef.current = false
        try {
          scannerRef.current?.resume()
        } catch {
          /* ignore */
        }
      }, 2000)
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "No se pudo validar el código"
      setOverlay({
        kind: "error",
        message: message.toUpperCase(),
      })
    }
  }, [])

  const handleDecoded = useCallback(
    async (decodedText: string) => {
      if (isProcessingRef.current) return
      const qrHash = decodedText.trim()
      if (!qrHash) return
      const t = tokenRef.current
      const b = barIdRef.current
      if (!t || !b) return

      isProcessingRef.current = true
      try {
        scannerRef.current?.pause(true)
      } catch {
        /* ignore */
      }

      // 1) ¿Es un QR de pedido? GET idempotente. Si 404 → no es pedido, cae al canje 1×1.
      //    Cualquier otro error (ej. pedido de otro evento, 400) se muestra, no se canjea.
      try {
        const found = await apiFetch<PickupOrderView>(
          `/bars/${b}/pickups/${qrHash}`,
          { method: "GET", token: t }
        )
        playScannerSound("success")
        setOrder(found)
        isProcessingRef.current = false
        setPhase("order")
        return
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) {
          const message =
            e instanceof ApiError ? e.message : "No se pudo validar el código"
          setOverlay({ kind: "error", message: message.toUpperCase() })
          return
        }
      }

      // 2) QR individual de consumición.
      await redeemSingle(qrHash)
    },
    [redeemSingle]
  )

  useEffect(() => {
    if (!open || phase !== "scanning" || !barId || !token) {
      return
    }

    setCameraError(null)
    const elId = readerIdRef.current
    const html5 = new Html5Qrcode(elId, false)
    scannerRef.current = html5
    let cancelled = false

    void html5
      .start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.min(viewfinderWidth, viewfinderHeight, 340)
            return { width: edge, height: edge }
          },
        },
        (text) => {
          void handleDecoded(text)
        },
        () => {}
      )
      .then(() => {
        if (cancelled || !torchDesired) return
        return html5
          .applyVideoConstraints({
            advanced: [{ torch: true } as MediaTrackConstraintSet],
          })
          .catch(() => {
            /* torch not supported or denied — seguir sin linterna */
          })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCameraError(
            err instanceof Error ? err.message : "No se pudo abrir la cámara"
          )
        }
      })

    return () => {
      cancelled = true
      scannerRef.current = null
      void html5
        .stop()
        .then(() => html5.clear())
        .catch(() => {})
    }
  }, [open, phase, torchDesired, barId, token, handleDecoded])

  const dismissError = () => {
    setOverlay({ kind: "none" })
    isProcessingRef.current = false
    try {
      scannerRef.current?.resume()
    } catch {
      /* ignore */
    }
  }

  // Entrega del pedido: marca todo REDEEMED + descuenta stock en el backend (4.2),
  // overlay "SERVIR 2× Fernet, 1× Gancia" y beep. Impresión opcional del ticket.
  const handleDeliver = useCallback(async () => {
    if (!order || !barId || !token || delivering) return
    if (order.status !== "PENDING") return
    setDelivering(true)
    try {
      const res = await apiFetch<DeliverResponse>(
        `/bars/${barId}/pickups/${order.token}/deliver`,
        { method: "POST", token }
      )
      playScannerSound("success")

      if (selectedPrinter) {
        try {
          const bytes = commandsToBytes(
            formatPedidoEntregado({
              eventoNombre: eventName ?? null,
              barNombre: barName ?? null,
              items: res.items.map((i) => ({
                name: i.productName,
                quantity: i.quantity,
              })),
              totalAmount: res.totalAmount ?? null,
            })
          )
          await printRaw(bytes)
        } catch {
          /* sin impresora / browser — la entrega no depende de imprimir */
        }
      }

      setDeliveredSummary({ items: res.items, totalAmount: res.totalAmount ?? "" })
      window.setTimeout(() => {
        setDeliveredSummary(null)
        setOrder(null)
        setDelivering(false)
        // Sigue escaneando el próximo código.
        setPhase("scanning")
      }, 4000)
    } catch (e) {
      setDelivering(false)
      const message =
        e instanceof ApiError ? e.message : "No se pudo entregar el pedido"
      setOverlay({ kind: "error", message: message.toUpperCase() })
    }
  }, [order, barId, token, delivering, selectedPrinter, printRaw, eventName, barName])

  const pickTicket = () => {
    setTorchDesired(true)
    setPhase("scanning")
  }

  const pickPhone = () => {
    setTorchDesired(false)
    setPhase("scanning")
  }

  // Alterna entre ticket (linterna) y celular sin volver al selector. Al cambiar
  // `torchDesired` se reinicia la cámara con las restricciones correspondientes.
  const toggleScanMode = () => {
    setTorchDesired((current) => !current)
  }

  const orderDelivered = order?.status !== "PENDING"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "fixed inset-0 top-0 left-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-[#0A0A0A] p-0 text-zinc-50 ring-0 sm:max-w-none"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Escanear QR de consumición</DialogTitle>
        </DialogHeader>

        {phase === "choose" ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-8 px-5 py-10">
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20">
                <ScanLine className="h-8 w-8 text-violet-400" />
              </span>
              <p className="mt-6 text-2xl font-black tracking-tighter text-white">
                Escanear QR para consumiciones
              </p>
              <p className="mt-2 text-base text-zinc-400">
                Elegí cómo vas a leer el código
              </p>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-[5.5rem] flex-col gap-3 rounded-[28px] border-2 border-zinc-700 bg-background py-7 text-base font-bold text-white shadow-xl shadow-black/20 transition-all duration-300 active:scale-[0.98]"
                onClick={pickTicket}
              >
                <span className="flex items-center gap-3 text-lg" aria-hidden>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20">
                    <Flashlight className="h-7 w-7 text-amber-400" />
                  </span>
                  Ticket / Papel
                </span>
                <span className="text-sm font-normal text-zinc-400">
                  Linterna encendida (si el dispositivo lo permite)
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-[5.5rem] flex-col gap-3 rounded-[28px] border-2 border-zinc-700  py-7 text-base font-bold text-white shadow-xl shadow-black/20 transition-all duration-300 hover:bg-zinc-800 active:scale-[0.98]"
                onClick={pickPhone}
              >
                <span className="flex items-center gap-3 text-lg" aria-hidden>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/20">
                    <Smartphone className="h-7 w-7 text-sky-400" />
                  </span>
                  App / Celular
                </span>
                <span className="text-sm font-normal text-zinc-400">
                  Pantalla brillante, sin linterna
                </span>
              </Button>
            </div>
          </div>
        ) : phase === "order" && order ? (
          <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
            <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/20">
                    <Package className="h-6 w-6 text-violet-400" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      Pedido de retiro
                    </p>
                    <p className="mt-0.5 text-lg font-black tracking-tighter text-white">
                      {order.items.reduce((n, i) => n + i.quantity, 0)} consumiciones
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
                    order.status === "PENDING" &&
                      "bg-amber-500/15 text-amber-400",
                    order.status === "DELIVERED" &&
                      "bg-emerald-500/15 text-emerald-400",
                    order.status === "CANCELLED" && "bg-red-500/15 text-red-400"
                  )}
                >
                  {order.status === "PENDING"
                    ? "Pendiente"
                    : order.status === "DELIVERED"
                      ? "Entregado"
                      : "Cancelado"}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {order.items.length === 0 ? (
                <p className="py-10 text-center text-base text-zinc-500">
                  Este pedido no tiene items.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {order.items.map((item) => (
                    <li
                      key={item.productId}
                      className={cn(
                        "flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4",
                        orderDelivered && "opacity-50"
                      )}
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-xl font-black text-emerald-400">
                        {item.quantity}×
                      </span>
                      <p className="text-xl font-black tracking-tight text-white">
                        {item.productName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {orderDelivered ? (
                <p className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center text-base font-semibold text-zinc-400">
                  {order.status === "DELIVERED"
                    ? "Este pedido ya fue entregado."
                    : "Este pedido fue cancelado."}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 space-y-3 border-t border-zinc-800 bg-[#0A0A0A]/95 px-4 py-4 backdrop-blur-md">
              {order.status === "PENDING" ? (
                <Button
                  type="button"
                  disabled={delivering}
                  onClick={() => void handleDeliver()}
                  className="h-16 w-full gap-2 rounded-2xl bg-emerald-500 text-lg font-black tracking-tight text-emerald-950 transition-all duration-300 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
                >
                  {delivering ? (
                    <span className="animate-pulse">Entregando…</span>
                  ) : (
                    <>
                      <Check className="h-6 w-6" />
                      Entregado
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="h-14 w-full rounded-2xl border border-zinc-700 bg-zinc-900 text-base font-semibold text-zinc-100 transition-all duration-300 hover:bg-zinc-800 active:scale-[0.98]"
                onClick={resetToChoose}
              >
                Volver a escanear
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col bg-black">
            {cameraError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
                <p className="text-lg font-semibold text-red-400">{cameraError}</p>
                <Button
                  type="button"
                  className="h-14 min-w-[220px] rounded-2xl bg-violet-600 text-base font-bold text-white transition-all duration-300 hover:bg-violet-500 active:scale-[0.98]"
                  onClick={resetToChoose}
                >
                  Volver a intentar
                </Button>
              </div>
            ) : (
              <>
                <div
                  id={readerIdRef.current}
                  className="min-h-0 flex-1 [&_video]:object-cover"
                />
                <div className="shrink-0 border-t border-zinc-800 bg-[#0A0A0A]/95 px-4 py-4 backdrop-blur-md">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-14 w-full rounded-2xl border border-zinc-700 bg-zinc-900 text-base font-semibold text-zinc-100 transition-all duration-300 hover:bg-zinc-800 active:scale-[0.98]"
                    onClick={toggleScanMode}
                  >
                    {torchDesired
                      ? "Cambiar a app / celular"
                      : "Cambiar a ticket / papel"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {overlay.kind === "success" ? (
          <div
            className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center bg-emerald-600/92 px-4 text-center"
            role="status"
            aria-live="polite"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">
              Listo
            </p>
            <p className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              ¡SERVIR: 1× {overlay.productName}!
            </p>
          </div>
        ) : null}

        {deliveredSummary ? (
          <div
            className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center bg-emerald-600/92 px-4 text-center"
            role="status"
            aria-live="polite"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">
              Pedido entregado
            </p>
            <p className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              ¡SERVIR!
            </p>
            <ul className="mt-4 flex flex-col gap-1.5">
              {deliveredSummary.items.map((item) => (
                <li
                  key={item.productId}
                  className="text-2xl font-black tracking-tight text-white sm:text-3xl"
                >
                  {item.quantity}× {item.productName}
                </li>
              ))}
            </ul>
            {deliveredSummary.totalAmount ? (
              <p className="mt-5 text-lg font-bold tabular-nums text-emerald-100">
                ${Number.parseFloat(deliveredSummary.totalAmount).toFixed(2)}
              </p>
            ) : null}
          </div>
        ) : null}

        {overlay.kind === "error" ? (
          <div
            className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-red-700/95 px-4 text-center"
            role="alert"
          >
            <p className="text-2xl font-black uppercase leading-tight tracking-tight text-white sm:text-3xl">
              {overlay.message}
            </p>
            <Button
              type="button"
              className="mt-10 h-16 min-w-[240px] rounded-2xl bg-white text-lg font-bold text-red-800 transition-all duration-300 hover:bg-zinc-100 active:scale-[0.98]"
              onClick={dismissError}
            >
              Entendido
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
