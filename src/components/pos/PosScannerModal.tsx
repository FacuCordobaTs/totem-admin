import { useCallback, useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Flashlight,
  Smartphone,
  ScanLine,
  Package,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react"
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
type StockShortage = {
  inventoryItemId: string
  inventoryItemName: string
  required: string
  available: string
}

/** Pedido de retiro (GET /bars/:barId/pickups/:token). */
type PickupOrderView = {
  token: string
  status: "PENDING" | "DELIVERED" | "CANCELLED"
  items: PickupOrderItem[]
  stockShortages?: StockShortage[]
}

/** Respuesta de POST /bars/:barId/pickups/:token/deliver. */
type DeliverResponse = {
  ok: boolean
  items: PickupOrderItem[]
  totalAmount?: string
}

type ScannedPickup = PickupOrderView & {
  scannedAt: number
}

const PICKUPS_PER_PAGE = 4

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
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false)

  // Pedido de retiro (4.3): el QR escaneado era un pedido → ver lista, entregar.
  const [order, setOrder] = useState<PickupOrderView | null>(null)
  const [delivering, setDelivering] = useState(false)
  const [scannedPickups, setScannedPickups] = useState<ScannedPickup[]>([])
  const [pickupHistoryPage, setPickupHistoryPage] = useState(1)
  // Estado efímero para que cada barman pueda organizar la preparación. No se persiste.
  const [servedProductIds, setServedProductIds] = useState<Set<string>>(() => new Set())

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const readerIdRef = useRef(`pos-scanner-${Math.random().toString(36).slice(2, 11)}`)
  const isProcessingRef = useRef(false)
  const tokenRef = useRef(token)
  const barIdRef = useRef(barId)
  const phaseRef = useRef<Phase>(phase)
  const scannerHistoryEntryRef = useRef(false)
  const closeAfterHistoryBackRef = useRef(false)

  const { selectedPrinter, printRaw } = usePrinter()

  tokenRef.current = token
  barIdRef.current = barId
  phaseRef.current = phase

  const resetToChoose = useCallback(() => {
    setPhase("choose")
    setTorchDesired(false)
    setCameraError(null)
    setOverlay({ kind: "none" })
    setOrder(null)
    setDelivering(false)
    setServedProductIds(new Set())
    isProcessingRef.current = false
  }, [])

  const resumeScanning = useCallback(() => {
    setOrder(null)
    setServedProductIds(new Set())
    setDelivering(false)
    setOverlay({ kind: "none" })
    isProcessingRef.current = false
    setPhase("scanning")
  }, [])

  useEffect(() => {
    if (!open) {
      resetToChoose()
      setCloseConfirmationOpen(false)
    }
  }, [open, resetToChoose])

  // En móvil, el gesto/botón de atrás dispara `popstate`. Agregamos una entrada
  // temporal para poder consumir ese gesto sin abandonar la ruta del escáner.
  // El primer atrás vuelve al selector; desde ahí, el siguiente pide confirmar
  // antes de salir del módulo.
  useEffect(() => {
    if (!open) return

    const pushScannerHistoryEntry = () => {
      const currentState = window.history.state
      window.history.pushState(
        {
          ...(currentState && typeof currentState === "object" ? currentState : {}),
          crowPosScanner: true,
        },
        "",
        window.location.href
      )
      scannerHistoryEntryRef.current = true
    }

    const handlePopState = () => {
      // Al confirmar la salida quitamos nuestra entrada temporal. El padre
      // reemplaza entonces la ruta del escáner por el selector de operaciones.
      if (closeAfterHistoryBackRef.current) {
        closeAfterHistoryBackRef.current = false
        scannerHistoryEntryRef.current = false
        onOpenChange(false)
        return
      }

      if (phaseRef.current === "choose") {
        setCloseConfirmationOpen(true)
      } else {
        resetToChoose()
      }

      // `popstate` no se puede cancelar: restauramos la entrada inmediatamente
      // para que el próximo atrás siga perteneciendo al flujo del escáner.
      pushScannerHistoryEntry()
    }

    pushScannerHistoryEntry()
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [open, onOpenChange, resetToChoose])

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
        setScannedPickups((current) => [
          { ...found, scannedAt: Date.now() },
          ...current,
        ])
        setPickupHistoryPage(1)
        setOrder(found)
        setServedProductIds(new Set())
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
    if ((order.stockShortages?.length ?? 0) > 0) return
    setDelivering(true)
    try {
      const res = await apiFetch<DeliverResponse>(
        `/bars/${barId}/pickups/${order.token}/deliver`,
        { method: "POST", token }
      )
      playScannerSound("success")
      setScannedPickups((current) =>
        current.map((pickup) =>
          pickup.token === order.token
            ? { ...pickup, status: "DELIVERED" }
            : pickup
        )
      )

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

      // La acción principal deja la cámara lista inmediatamente para el próximo pedido.
      resumeScanning()
    } catch (e) {
      setDelivering(false)
      const message =
        e instanceof ApiError ? e.message : "No se pudo entregar el pedido"
      setOverlay({ kind: "error", message: message.toUpperCase() })
    }
  }, [order, barId, token, delivering, selectedPrinter, printRaw, eventName, barName, resumeScanning])

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
  const hasStockShortages = (order?.stockShortages?.length ?? 0) > 0
  const pickupHistoryTotalPages = Math.max(
    1,
    Math.ceil(scannedPickups.length / PICKUPS_PER_PAGE)
  )
  const pickupHistoryItems = scannedPickups.slice(
    (pickupHistoryPage - 1) * PICKUPS_PER_PAGE,
    pickupHistoryPage * PICKUPS_PER_PAGE
  )

  const toggleServedProduct = (productId: string) => {
    setServedProductIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const requestClose = () => {
    if (phaseRef.current !== "choose") {
      resetToChoose()
      return
    }
    setCloseConfirmationOpen(true)
  }

  const confirmClose = () => {
    setCloseConfirmationOpen(false)

    if (!scannerHistoryEntryRef.current) {
      onOpenChange(false)
      return
    }

    // Volvemos a la entrada de la ruta del escáner y el handler de popstate
    // delega el cierre al padre. Así no queda una ruta /pos/escaner en el
    // historial al volver al selector.
    closeAfterHistoryBackRef.current = true
    window.history.back()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
      >
        <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed inset-0 top-0 left-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-[#0A0A0A] p-0 text-zinc-50 ring-0 sm:max-w-none"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Escanear QR de consumición</DialogTitle>
        </DialogHeader>

        {phase === "choose" ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-10">
            <div className="mx-auto flex w-full max-w-md flex-col gap-8">
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
            <section className="border-t border-zinc-800 pt-6" aria-labelledby="scanned-pickups-title">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-violet-400" />
                <h2 id="scanned-pickups-title" className="text-base font-black text-white">
                  Últimos retiros escaneados
                </h2>
              </div>

              {pickupHistoryItems.length === 0 ? (
                <p className="py-5 text-sm text-zinc-500">
                  Los retiros que escanees aparecerán acá.
                </p>
              ) : (
                <>
                  <ul className="mt-4 space-y-2">
                    {pickupHistoryItems.map((pickup, index) => {
                      const quantity = pickup.items.reduce((total, item) => total + item.quantity, 0)
                      const products = pickup.items
                        .map((item) => `${item.quantity}× ${item.productName}`)
                        .join(", ")
                      const isDelivered = pickup.status === "DELIVERED"

                      return (
                        <li
                          key={`${pickup.token}-${pickup.scannedAt}-${index}`}
                          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-zinc-100">
                                {quantity} {quantity === 1 ? "consumición" : "consumiciones"}
                              </p>
                              <p className="mt-1 truncate text-sm text-zinc-400" title={products}>
                                {products || "Sin productos"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                                  isDelivered
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : pickup.status === "CANCELLED"
                                      ? "bg-red-500/15 text-red-400"
                                      : "bg-amber-500/15 text-amber-400"
                                )}
                              >
                                {isDelivered ? "Entregado" : pickup.status === "CANCELLED" ? "Cancelado" : "Pendiente"}
                              </span>
                              <p className="mt-1.5 text-xs text-zinc-500">
                                {new Date(pickup.scannedAt).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  {pickupHistoryTotalPages > 1 ? (
                    <div className="mt-4 flex items-center justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        disabled={pickupHistoryPage === 1}
                        onClick={() => setPickupHistoryPage((page) => Math.max(1, page - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <span className="text-xs font-medium text-zinc-500">
                        Página {pickupHistoryPage} de {pickupHistoryTotalPages}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        disabled={pickupHistoryPage === pickupHistoryTotalPages}
                        onClick={() => setPickupHistoryPage((page) => Math.min(pickupHistoryTotalPages, page + 1))}
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
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
                  {order.items.map((item) => {
                    const isServed = servedProductIds.has(item.productId)
                    return (
                      <li
                        key={item.productId}
                        role="button"
                        tabIndex={orderDelivered ? -1 : 0}
                        aria-pressed={isServed}
                        onClick={() => !orderDelivered && toggleServedProduct(item.productId)}
                        onKeyDown={(event) => {
                          if (!orderDelivered && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault()
                            toggleServedProduct(item.productId)
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors active:scale-[0.99]",
                          isServed
                            ? "border-emerald-400 bg-emerald-400 text-emerald-950"
                            : "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15",
                          orderDelivered && "cursor-default opacity-50"
                        )}
                      >
                        <span className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black",
                          isServed ? "bg-emerald-950/15 text-emerald-950" : "bg-emerald-500/20 text-emerald-300"
                        )}>
                          {item.quantity}×
                        </span>
                        <p className={cn("flex-1 text-xl font-black tracking-tight", isServed ? "text-emerald-950" : "text-white")}>
                          {item.productName}
                        </p>
                        <Check className={cn("h-6 w-6 shrink-0", isServed ? "text-emerald-950" : "text-emerald-400/50")} />
                      </li>
                    )
                  })}
                </ul>
              )}

              {hasStockShortages ? (
                <section className="mt-5 rounded-2xl border border-red-400/50 bg-red-500/15 p-4" aria-live="assertive">
                  <div className="flex items-center gap-2 text-red-300">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p className="font-black">No alcanza el stock para entregar este pedido</p>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {order.stockShortages?.map((shortage) => (
                      <li key={shortage.inventoryItemId} className="text-sm font-semibold text-red-100">
                        {shortage.inventoryItemName}: hay {shortage.available}, se necesitan {shortage.required}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {orderDelivered ? (
                <p className={cn(
                  "mt-5 px-4 py-8 text-center text-2xl font-black uppercase leading-tight tracking-tight",
                  order.status === "DELIVERED" ? "bg-red-700 text-white" : "rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-400"
                )}>
                  {order.status === "DELIVERED"
                    ? "Este pedido ya fue entregado"
                    : "Este pedido fue cancelado."}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 space-y-3 border-t border-zinc-800 bg-[#0A0A0A]/95 px-4 py-4 backdrop-blur-md">
              {order.status === "PENDING" ? (
                <Button
                  type="button"
                  disabled={delivering || hasStockShortages}
                  onClick={() => void handleDeliver()}
                  className="h-16 w-full gap-2 rounded-2xl bg-emerald-500 text-lg font-black tracking-tight text-emerald-950 transition-all duration-300 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
                >
                  {delivering ? (
                    <span className="animate-pulse">Entregando…</span>
                  ) : (
                    <>
                      <Check className="h-6 w-6" />
                      Entregado y volver a escanear
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="mx-auto h-10 w-auto px-4 text-sm font-medium text-zinc-500 hover:bg-transparent hover:text-zinc-300"
                onClick={resumeScanning}
              >
                No entregado
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

        {phase === "order" && order?.status === "DELIVERED" ? (
          <div
            className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-red-700 px-6 text-center"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="h-16 w-16 text-red-100" />
            <p className="mt-6 text-4xl font-black uppercase leading-tight tracking-tight text-white sm:text-5xl">
              Este pedido ya fue entregado
            </p>
            <Button
              type="button"
              className="mt-10 h-14 min-w-[240px] rounded-2xl bg-white text-base font-bold text-red-800 hover:bg-red-50"
              onClick={resumeScanning}
            >
              Volver a escanear
            </Button>
          </div>
        ) : null}

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

      <AlertDialog open={closeConfirmationOpen} onOpenChange={setCloseConfirmationOpen}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir del escáner?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Vas a volver al selector de operaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800 hover:text-white"
              onClick={() => setCloseConfirmationOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmClose}>
              Salir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
