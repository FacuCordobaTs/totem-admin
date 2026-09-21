/**
 * Escáner de códigos compartido por el POS (consumiciones) y la puerta (entradas y DNI).
 *
 * Reemplaza a `html5-qrcode` y `@yudiel/react-qr-scanner`: un solo stack de cámara, un solo
 * motor de decodificación (ver `lib/zxing-engine.ts`) y las mismas capacidades de linterna,
 * zoom y cambio de cámara en todos los modos.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import {
  DECODE_MAX_EDGE,
  DNI_OPTIONS,
  QR_DEEP_OPTIONS,
  QR_FAST_OPTIONS,
  readBarcodes,
  zxingReady,
} from "@/lib/zxing-engine"
import type { ReaderOptions } from "@/lib/zxing-engine"

export type ScannerProfile = "qr" | "dni"

export type UseZxingScannerOptions = {
  /** Ciclo de vida de la cámara: al pasar a `false` se libera el stream. */
  active: boolean
  /** Compuerta sólo de decodificación: **no** libera la cámara. */
  paused: boolean
  facingMode: "environment" | "user"
  profile: ScannerProfile
  /** Linterna deseada. Se aplica al track vivo, sin reiniciar la cámara. */
  torch?: boolean
  /**
   * Pausa el loop apenas se entrega un resultado; el consumidor reanuda con `resume()` o
   * cambiando la prop `paused`. Es lo que necesita el POS, donde cada lectura dispara una
   * llamada de red y decodificar durante ese lapso es trabajo tirado.
   */
  pauseOnResult?: boolean
  onResult: (raw: string) => void
  onError?: (message: string | null) => void
}

export type UseZxingScannerResult = {
  videoRef: RefObject<HTMLVideoElement | null>
  torchAvailable: boolean
  torchOn: boolean
  zoomRange: { min: number; max: number; step: number } | null
  zoomValue: number
  setZoom: (value: number) => void
  error: string | null
  /** Pausa y reanudación imperativas (compatibilidad con los call sites existentes del POS). */
  pause: () => void
  resume: () => void
}

/** Intervalo mínimo entre decodificaciones (~20/s). Acota el trabajo de wasm en el hilo principal. */
const DECODE_INTERVAL_MS = 50
/** 1 de cada N intentos usa el pase profundo (más caro, más tolerante). */
const DEEP_EVERY = 6
/** Ventana durante la cual se ignora el mismo texto ya detectado. */
const DUPLICATE_WINDOW_MS = 1500
/** Fallos consecutivos de decodificación antes de darlo por irrecuperable. */
const MAX_DECODE_ERRORS = 3

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean
  zoom?: { min: number; max: number; step: number }
}

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
  torch?: boolean
  zoom?: number
}

function optionsFor(profile: ScannerProfile, attempt: number): ReaderOptions {
  if (profile === "dni") return DNI_OPTIONS
  return attempt % DEEP_EVERY === 0 ? QR_DEEP_OPTIONS : QR_FAST_OPTIONS
}

export function useZxingScanner({
  active,
  paused,
  facingMode,
  profile,
  torch = false,
  pauseOnResult = false,
  onResult,
  onError,
}: UseZxingScannerOptions): UseZxingScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  // Estado de dedupe: en refs (y no en el closure del efecto) para que `resume()` pueda
  // limpiarlo.
  const lastTextRef = useRef("")
  const lastTextAtRef = useRef(0)

  // Los callbacks viven en refs: si entraran en las dependencias de los efectos, el loop se
  // recrearía en cada render y la cámara se reiniciaría en bucle. Se sincronizan en un efecto
  // sin deps (y no durante el render) para no romper la pureza del render.
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  const profileRef = useRef(profile)
  const pauseOnResultRef = useRef(pauseOnResult)

  useEffect(() => {
    onResultRef.current = onResult
    onErrorRef.current = onError
    profileRef.current = profile
    pauseOnResultRef.current = pauseOnResult
  })

  // `paused` se sincroniza por efecto para que `pause()`/`resume()` manden hasta que la prop
  // cambie de verdad (es el contrato que esperan los call sites del POS).
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
    // Reanudar es "empezar de cero": sin esto, volver a apuntar al mismo código después de
    // cerrar un overlay cae dentro de la ventana de dedupe y se ignora en silencio.
    if (!paused) lastTextRef.current = ""
  }, [paused])

  const [error, setError] = useState<string | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoomValue, setZoomValue] = useState(1)

  const pause = useCallback(() => {
    pausedRef.current = true
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    // Reanudar es "empezar de cero": sin esto, volver a apuntar al mismo código tras cerrar un
    // error cae dentro de la ventana de dedupe y se ignora en silencio.
    lastTextRef.current = ""
  }, [])

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let stream: MediaStream | null = null
    let videoEl: HTMLVideoElement | null = null
    let rafId = 0

    // Canvas y contexto reutilizables, fuera del DOM. `willReadFrequently` evita el readback
    // GPU→CPU en cada `getImageData`. (El `ImageData` en sí no se puede reutilizar: la API 2D
    // siempre asigna uno nuevo.)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true })

    let inFlight = false
    let fatal = false
    let missStreak = 0
    let errorStreak = 0
    let lastDecodeAt = 0

    const handleDecodeError = (err: unknown) => {
      errorStreak += 1
      if (errorStreak < MAX_DECODE_ERRORS || fatal) return
      fatal = true
      onErrorRef.current?.(
        err instanceof Error ? err.message : "No se pudo iniciar el lector de códigos"
      )
    }

    const tick = () => {
      if (cancelled) return
      rafId = requestAnimationFrame(tick)
      if (pausedRef.current || inFlight || fatal || !ctx) return

      const now = performance.now()
      if (now - lastDecodeAt < DECODE_INTERVAL_MS) return

      const video = videoRef.current
      if (!video || video.readyState < 2) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) return

      const maxEdge = DECODE_MAX_EDGE[profileRef.current]
      const scale = Math.min(1, maxEdge / Math.max(vw, vh))
      const cw = Math.max(1, Math.round(vw * scale))
      const ch = Math.max(1, Math.round(vh * scale))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }

      try {
        ctx.drawImage(video, 0, 0, cw, ch)
      } catch {
        return
      }

      lastDecodeAt = now
      inFlight = true
      missStreak += 1

      readBarcodes(ctx.getImageData(0, 0, cw, ch), optionsFor(profileRef.current, missStreak))
        .then((results) => {
          errorStreak = 0
          const text = results[0]?.text?.trim()
          if (!text) return
          missStreak = 0
          const at = performance.now()
          if (text === lastTextRef.current && at - lastTextAtRef.current < DUPLICATE_WINDOW_MS) {
            return
          }
          lastTextRef.current = text
          lastTextAtRef.current = at
          if (pauseOnResultRef.current) pausedRef.current = true
          onResultRef.current(text)
        })
        .catch(handleDecodeError)
        .finally(() => {
          inFlight = false
        })
    }

    const start = async () => {
      // Que el primer frame no pague la compilación del wasm. Si falla, el error real aparece
      // en el primer intento de decodificación (no queremos bloquear el arranque de la cámara).
      try {
        await zxingReady
      } catch {
        /* se reporta al decodificar */
      }
      if (cancelled) return

      let media: MediaStream
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Permiso de cámara denegado"
              : "No se pudo abrir la cámara"
          )
        }
        return
      }

      if (cancelled) {
        media.getTracks().forEach((t) => t.stop())
        return
      }

      const video = videoRef.current
      if (!video) {
        media.getTracks().forEach((t) => t.stop())
        return
      }

      stream = media
      const track = media.getVideoTracks()[0] ?? null
      trackRef.current = track
      videoEl = video
      video.srcObject = media
      // Obligatorios en iOS Safari: sin esto el video no se pinta inline y `drawImage` da negro.
      video.playsInline = true
      video.muted = true
      try {
        await video.play()
      } catch {
        /* algunos WebView resuelven sin lanzar */
      }
      if (cancelled) return

      if (track) {
        // Sólo constraints básicas en `getUserMedia`; las avanzadas van acá y cada una en su
        // propio try/catch. Safari y varios WebView lanzan `OverconstrainedError` ante una
        // constraint desconocida, y eso convertiría "sin linterna" en "sin cámara".
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as ExtendedMediaTrackConstraintSet],
          })
        } catch {
          /* sin autofoco continuo: se sigue igual */
        }

        try {
          const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities
          const settings = track.getSettings() as MediaTrackSettings & { zoom?: number }
          setTorchAvailable(capabilities.torch === true)
          if (
            capabilities.zoom &&
            Number.isFinite(capabilities.zoom.min) &&
            Number.isFinite(capabilities.zoom.max) &&
            capabilities.zoom.max > capabilities.zoom.min
          ) {
            const range = {
              min: capabilities.zoom.min,
              max: capabilities.zoom.max,
              step: capabilities.zoom.step || 0.1,
            }
            setZoomRange(range)
            setZoomValue(Math.min(range.max, Math.max(range.min, settings.zoom ?? range.min)))
          } else {
            setZoomRange(null)
          }
        } catch {
          // Cámara sin capacidades avanzadas (webcams de escritorio, por ejemplo).
          setTorchAvailable(false)
          setZoomRange(null)
        }
      }

      if (cancelled) return
      rafId = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      trackRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
      if (videoEl) videoEl.srcObject = null
      // Al desactivar (o reiniciar por cambio de cámara) el estado vuelve a cero, así una
      // reapertura no hereda el error ni los controles de la sesión anterior.
      setError(null)
      setTorchAvailable(false)
      setTorchOn(false)
      setZoomRange(null)
    }
  }, [active, facingMode])

  // La linterna se aplica al track vivo: alternarla no reinicia la cámara.
  useEffect(() => {
    const track = trackRef.current
    if (!track || !torchAvailable) return
    let cancelled = false
    track
      .applyConstraints({ advanced: [{ torch } as ExtendedMediaTrackConstraintSet] })
      .then(() => {
        if (!cancelled) setTorchOn(torch)
      })
      .catch(() => {
        if (!cancelled) {
          setTorchAvailable(false)
          setTorchOn(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [torch, torchAvailable, active])

  const setZoom = useCallback(
    (value: number) => {
      setZoomValue(value)
      const track = trackRef.current
      if (!track || !zoomRange) return
      track
        .applyConstraints({ advanced: [{ zoom: value } as ExtendedMediaTrackConstraintSet] })
        .catch(() => setZoomRange(null))
    },
    [zoomRange]
  )

  return {
    videoRef,
    torchAvailable,
    torchOn,
    zoomRange,
    zoomValue,
    setZoom,
    error,
    pause,
    resume,
  }
}
