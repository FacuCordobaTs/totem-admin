/**
 * Escáner de códigos compartido por el POS (consumiciones) y la puerta (entradas y DNI).
 *
 * Reemplaza a `html5-qrcode` y `@yudiel/react-qr-scanner`: un solo stack de cámara, un solo
 * motor de decodificación (ver `lib/zxing-engine.ts`) y las mismas capacidades de linterna,
 * zoom y cambio de cámara en todos los modos.
 *
 * Velocidad (QR en movimiento): hay dos lectores corriendo en paralelo sobre el mismo video.
 *
 * 1. `BarcodeDetector` nativo cuando existe (Chrome/WebView Android: es el mismo motor de
 *    Google que usa el escáner de la cámara del celular). Se le pasa el `<video>` directo,
 *    corre fuera del hilo principal y tolera desenfoque y movimiento muchísimo mejor que zxing.
 * 2. `zxing-wasm` en un Web Worker (ver `lib/zxing-worker.ts`), sin intervalo artificial: el
 *    próximo frame se captura apenas termina el anterior. Rota entre recortes chicos del área
 *    visible (rápidos, y al reducir la imagen el blur de movimiento ocupa menos píxeles) y el
 *    frame completo, con un pase profundo intercalado para QR invertidos.
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
import type { DecodeJob, DecodePreset, DecodeRequest, DecodeResponse } from "@/lib/zxing-worker"

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

/**
 * Intervalo mínimo entre decodificaciones zxing cuando corre en el hilo principal (fallback
 * sin Worker) o como red de seguridad detrás del detector nativo.
 */
const MAIN_THREAD_INTERVAL_MS = 50
const BACKUP_INTERVAL_MS = 150
/** Ventana durante la cual se ignora el mismo texto ya detectado. */
const DUPLICATE_WINDOW_MS = 1500
/** Fallos consecutivos de decodificación antes de darlo por irrecuperable. */
const MAX_DECODE_ERRORS = 3

/**
 * Ciclo de intentos zxing para QR: cada entrada es la lista de pasadas sobre **un** frame
 * (se prueban en orden hasta que una lea). `square` es el cuadrado central del frame (lo que
 * el operador ve en el visor, que es `object-cover` cuadrado); `full`, el frame entero.
 * `edge` es el lado al que se reduce antes de decodificar.
 *
 * Medido con QR sintéticos con blur de movimiento: un mismo frame que no lee a 640 px sí lee
 * a 480, y cada pasada chica cuesta 1-6 ms, así que probar varias escalas por frame es casi
 * gratis y es lo que más rinde con el QR en movimiento. Las pasadas grandes cubren QR chicos
 * o lejanos; el pase profundo (QR invertidos) va intercalado porque con blur rinde peor.
 */
type DecodePass = { region: "square" | "full"; edge: number; preset: DecodePreset }
const QR_CYCLE: DecodePass[][] = [
  [
    { region: "square", edge: 640, preset: "fast" },
    { region: "square", edge: 480, preset: "fast" },
    { region: "square", edge: 360, preset: "fast" },
    { region: "square", edge: 270, preset: "fast" },
  ],
  [
    { region: "square", edge: 960, preset: "fast" },
    { region: "full", edge: DECODE_MAX_EDGE.qr, preset: "fast" },
    { region: "square", edge: 400, preset: "fast" },
  ],
  [
    { region: "square", edge: 560, preset: "fast" },
    { region: "square", edge: 420, preset: "fast" },
    { region: "square", edge: 320, preset: "fast" },
    { region: "square", edge: 240, preset: "fast" },
  ],
  [
    { region: "square", edge: 800, preset: "deep" },
    { region: "square", edge: 720, preset: "fast" },
    { region: "square", edge: 300, preset: "fast" },
  ],
]
const DNI_PASSES: DecodePass[] = [{ region: "full", edge: DECODE_MAX_EDGE.dni, preset: "dni" }]

const PRESET_OPTIONS: Record<DecodePreset, ReaderOptions> = {
  fast: QR_FAST_OPTIONS,
  deep: QR_DEEP_OPTIONS,
  dni: DNI_OPTIONS,
}

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type NativeBarcodeDetectorCtor = {
  new (opts: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats?: () => Promise<string[]>
}

/** Detector nativo de QR, o `null` si el navegador no lo trae (iOS, Linux/Windows desktop). */
let nativeQrDetectorPromise: Promise<NativeBarcodeDetector | null> | null = null
function getNativeQrDetector(): Promise<NativeBarcodeDetector | null> {
  if (nativeQrDetectorPromise) return nativeQrDetectorPromise
  nativeQrDetectorPromise = (async () => {
    const Ctor = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector
    if (!Ctor) return null
    try {
      const formats = (await Ctor.getSupportedFormats?.()) ?? []
      if (!formats.includes("qr_code")) return null
      return new Ctor({ formats: ["qr_code"] })
    } catch {
      return null
    }
  })()
  return nativeQrDetectorPromise
}

function createDecodeWorker(): Worker | null {
  try {
    return new Worker(new URL("../lib/zxing-worker.ts", import.meta.url), { type: "module" })
  } catch {
    return null
  }
}

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean
  zoom?: { min: number; max: number; step: number }
}

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
  torch?: boolean
  zoom?: number
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
    // GPU→CPU en cada `getImageData`.
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true })

    let fatal = false
    let errorStreak = 0
    let attempt = 0

    // Lector nativo (si existe): se resuelve en `start()`.
    let nativeDetector: NativeBarcodeDetector | null = null
    let nativeBusy = false

    // zxing: en Worker si se puede; si no, en el hilo principal con intervalo mínimo.
    let worker = createDecodeWorker()
    let zxingBusy = false
    let lastZxingAt = 0
    let requestSeq = 0

    const deliver = (raw: string | null | undefined) => {
      const text = raw?.trim()
      if (!text || cancelled || pausedRef.current) return
      const at = performance.now()
      if (text === lastTextRef.current && at - lastTextAtRef.current < DUPLICATE_WINDOW_MS) {
        return
      }
      lastTextRef.current = text
      lastTextAtRef.current = at
      if (pauseOnResultRef.current) pausedRef.current = true
      onResultRef.current(text)
    }

    const handleDecodeError = (err: unknown) => {
      errorStreak += 1
      if (errorStreak < MAX_DECODE_ERRORS || fatal) return
      fatal = true
      onErrorRef.current?.(
        err instanceof Error ? err.message : "No se pudo iniciar el lector de códigos"
      )
    }

    if (worker) {
      worker.onmessage = (ev: MessageEvent<DecodeResponse>) => {
        zxingBusy = false
        if (ev.data.error) {
          handleDecodeError(new Error(ev.data.error))
          return
        }
        errorStreak = 0
        deliver(ev.data.text)
      }
      // Si el Worker no carga (WebView viejo, chunk no cacheado offline), se sigue en el hilo
      // principal en vez de quedarse sin lector.
      worker.onerror = () => {
        worker?.terminate()
        worker = null
        zxingBusy = false
      }
    }

    /** Dibuja la región de la pasada en el canvas y devuelve sus píxeles. */
    const capture = (video: HTMLVideoElement, spec: DecodePass): ImageData | null => {
      if (!ctx) return null
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) return null
      let sx = 0
      let sy = 0
      let sw = vw
      let sh = vh
      if (spec.region === "square") {
        const side = Math.min(vw, vh)
        sx = Math.round((vw - side) / 2)
        sy = Math.round((vh - side) / 2)
        sw = side
        sh = side
      }
      const scale = Math.min(1, spec.edge / Math.max(sw, sh))
      const cw = Math.max(1, Math.round(sw * scale))
      const ch = Math.max(1, Math.round(sh * scale))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch)
        return ctx.getImageData(0, 0, cw, ch)
      } catch {
        return null
      }
    }

    const runNative = (video: HTMLVideoElement) => {
      if (!nativeDetector || nativeBusy) return
      nativeBusy = true
      nativeDetector
        .detect(video)
        .then((codes) => deliver(codes[0]?.rawValue))
        .catch(() => {
          // Un fallo del nativo no es fatal: zxing sigue cubriendo.
          nativeDetector = null
        })
        .finally(() => {
          nativeBusy = false
        })
    }

    const runZxing = (video: HTMLVideoElement, now: number, profile: ScannerProfile) => {
      if (zxingBusy || fatal) return
      // Con el nativo activo, zxing es sólo red de seguridad (QR invertidos): no le roba CPU.
      const minInterval =
        nativeDetector && profile === "qr"
          ? BACKUP_INTERVAL_MS
          : worker
            ? 0
            : MAIN_THREAD_INTERVAL_MS
      if (now - lastZxingAt < minInterval) return

      const passes = profile === "dni" ? DNI_PASSES : QR_CYCLE[attempt % QR_CYCLE.length]
      // Todas las pasadas salen del mismo frame: se capturan juntas, antes de que cambie.
      const jobs: DecodeJob[] = []
      for (const pass of passes) {
        const image = capture(video, pass)
        if (!image) return
        jobs.push({
          width: image.width,
          height: image.height,
          buffer: image.data.buffer as ArrayBuffer,
          preset: pass.preset,
        })
      }
      attempt += 1
      lastZxingAt = now
      zxingBusy = true

      if (worker) {
        const msg: DecodeRequest = { id: ++requestSeq, jobs }
        worker.postMessage(
          msg,
          jobs.map((job) => job.buffer)
        )
        return
      }

      void (async () => {
        try {
          for (const job of jobs) {
            const image = new ImageData(new Uint8ClampedArray(job.buffer), job.width, job.height)
            const results = await readBarcodes(image, PRESET_OPTIONS[job.preset])
            errorStreak = 0
            const text = results[0]?.text?.trim()
            if (text) {
              deliver(text)
              return
            }
          }
        } catch (err) {
          handleDecodeError(err)
        } finally {
          zxingBusy = false
        }
      })()
    }

    const tick = () => {
      if (cancelled) return
      rafId = requestAnimationFrame(tick)
      if (pausedRef.current) return

      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return

      const profile = profileRef.current
      if (profile === "qr") runNative(video)
      runZxing(video, performance.now(), profile)
    }

    const start = async () => {
      // El detector nativo se resuelve en paralelo con la cámara. Sin Worker, el primer frame
      // no paga la compilación del wasm en el hilo principal. Si falla, el error real aparece
      // en el primer intento de decodificación (no queremos bloquear el arranque de la cámara).
      const nativePromise = getNativeQrDetector()
      if (!worker) {
        try {
          await zxingReady
        } catch {
          /* se reporta al decodificar */
        }
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
            // Más fps = menos exposición por frame = menos blur cuando el QR se mueve. Sin
            // esto varias cámaras Android bajan a 15 fps con poca luz.
            frameRate: { ideal: 30 },
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

      nativeDetector = await nativePromise
      if (cancelled) return
      rafId = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      worker?.terminate()
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
