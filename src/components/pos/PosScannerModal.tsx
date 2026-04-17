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
import { Flashlight, Smartphone, ScanLine } from "lucide-react"

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

type Phase = "choose" | "scanning"

export type PosScannerModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  barId: string | null
  token: string | null
}

export function PosScannerModal({
  open,
  onOpenChange,
  barId,
  token,
}: PosScannerModalProps) {
  const [phase, setPhase] = useState<Phase>("choose")
  const [torchDesired, setTorchDesired] = useState(false)
  const [overlay, setOverlay] = useState<OverlayState>({ kind: "none" })
  const [cameraError, setCameraError] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const readerIdRef = useRef(`pos-scanner-${Math.random().toString(36).slice(2, 11)}`)
  const isProcessingRef = useRef(false)
  const tokenRef = useRef(token)
  const barIdRef = useRef(barId)

  tokenRef.current = token
  barIdRef.current = barId

  const resetToChoose = useCallback(() => {
    setPhase("choose")
    setTorchDesired(false)
    setCameraError(null)
    setOverlay({ kind: "none" })
    isProcessingRef.current = false
  }, [])

  useEffect(() => {
    if (!open) {
      resetToChoose()
    }
  }, [open, resetToChoose])

  const handleDecoded = useCallback(async (decodedText: string) => {
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

  const pickTicket = () => {
    setTorchDesired(true)
    setPhase("scanning")
  }

  const pickPhone = () => {
    setTorchDesired(false)
    setPhase("scanning")
  }

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
                    onClick={resetToChoose}
                  >
                    Cambiar modo (ticket / celular)
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
