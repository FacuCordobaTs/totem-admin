import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { Scanner } from "@yudiel/react-qr-scanner"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch, ApiError } from "@/lib/api"
import { parseQrHash } from "@/lib/parse-qr-hash"
import { parseDniBarcode } from "@/lib/dni-barcode"
import { playScannerSound } from "@/lib/scanner-sound"
import { useAuthStore } from "@/stores/auth-store"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import type { ApiEvent } from "@/types/events"
import {
  Camera,
  CameraOff,
  ChevronLeft,
  Flashlight,
  IdCard,
  ImagePlus,
  Keyboard,
  QrCode,
  RefreshCw,
  ScanLine,
  SwitchCamera,
  UserX,
  ZoomIn,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ValidateResponse = {
  message: string
  ticket: {
    id: string
    buyerName: string | null
    buyerEmail: string | null
  }
  /** Tarea 3.2 — id del tipo de entrada: el color del chip sale de este id (mapa por tipo). */
  ticketTypeId: string
  ticketTypeName: string
}

/** Tarea 1.4 — Respuesta de `POST /tickets/validate-by-dni` (misma lógica que el QR, con
 * discriminadores para la puerta: tipo de entrada y `reentry`). */
type ValidateByDniResponse = {
  message: string
  ticket: {
    id: string
    buyerName: string | null
    buyerEmail: string | null
    status: string
  }
  buyerName: string | null
  /** Tarea 3.2 — id del tipo de entrada: el color del chip sale de este id (mapa por tipo). */
  ticketTypeId: string
  ticketTypeName: string
  status: string
  reentry?: boolean
  gatePassCount?: number
}

type OverlayState =
  | {
      kind: "success"
      buyerName: string
      /** Tarea 3.2 — id del tipo de entrada: el color del chip sale de este id (mapa por tipo). */
      ticketTypeId: string
      ticketTypeName: string
      /** Tarea 1.3 — true cuando el ticket ya había entrado y el evento permite reingreso. */
      reentry?: boolean
      /** Tarea 1.3 — número de pase (gate_logs) para el aviso de reingreso. */
      gatePassCount?: number
    }
  | {
      kind: "error"
      headline: string
      detail: string
      /** Tarea 3.2 — persona en la lista de admisión: foto (R2) + motivo + nombre. */
      blacklist?: { motivo: string; foto: string | null; fullName: string | null }
    }

type ScanMode = "qr" | "dni"

/** Tarea 3.1 — id del contenedor del lector de DNI: html5-qrcode v2 resuelve el elemento por
 * `document.getElementById(id)` en el constructor (no acepta el elemento directo). */
const DNI_SCANNER_ELEMENT_ID = "dni-barcode-scanner"
const DNI_FILE_SCANNER_ELEMENT_ID = "dni-file-scanner"

const DNI_SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
]

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean
  zoom?: { min: number; max: number; step: number }
}

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
  torch?: boolean
  zoom?: number
}

/** Tarea 3.2 — El evento elegido en puerta persiste entre sesiones (localStorage): el guardia
 * no tiene que volver a elegirlo cada vez que abre la pantalla. */
const SCANNER_EVENT_STORAGE_KEY = "crow:scanner:selectedEventId"

/** Tarea 3.2 — Color por tipo de entrada (visión §2.4: "VIP o General, bien diferenciado por
 * color"). Los nombres conocidos mapean a colores de marca — VIP = dorado, General = blanco —
 * y los tipos custom del evento caen en una paleta determinística por hash del `ticketTypeId`
 * para distinguirse de un vistazo. */
type TicketTypeColor = { chip: string; halo: string }

const KNOWN_TICKET_TYPE_COLORS: { match: RegExp; color: TicketTypeColor }[] = [
  { match: /vip|dorad|gold/i, color: { chip: "bg-amber-400 text-amber-950", halo: "shadow-amber-400/60" } },
  { match: /general/i, color: { chip: "bg-white text-neutral-950", halo: "shadow-white/60" } },
  { match: /early|anticip/i, color: { chip: "bg-sky-300 text-sky-950", halo: "shadow-sky-300/60" } },
  { match: /premium|plus/i, color: { chip: "bg-fuchsia-400 text-fuchsia-950", halo: "shadow-fuchsia-400/60" } },
]

const FALLBACK_TICKET_TYPE_COLORS: TicketTypeColor[] = [
  { chip: "bg-violet-400 text-violet-950", halo: "shadow-violet-400/60" },
  { chip: "bg-cyan-300 text-cyan-950", halo: "shadow-cyan-300/60" },
  { chip: "bg-rose-400 text-rose-950", halo: "shadow-rose-400/60" },
  { chip: "bg-lime-300 text-lime-950", halo: "shadow-lime-300/60" },
  { chip: "bg-orange-300 text-orange-950", halo: "shadow-orange-300/60" },
]

function ticketTypeColor(ticketTypeId: string, ticketTypeName: string): TicketTypeColor {
  for (const { match, color } of KNOWN_TICKET_TYPE_COLORS) {
    if (match.test(ticketTypeName)) return color
  }
  // Fallback ante un backend desplegado sin el `ticketTypeId` nuevo (frontend y backend se
  // despliegan por separado): se hashea lo que haya.
  const seed = ticketTypeId || ticketTypeName
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return FALLBACK_TICKET_TYPE_COLORS[h % FALLBACK_TICKET_TYPE_COLORS.length]
}

/** Tarea 3.2 — Extrae la entrada de blacklist (motivo + foto de R2 + nombre) del error 403 de
 * `POST /tickets/validate*`: el backend la devuelve en el body cuando la persona figura en la
 * lista de admisión. */
function blacklistFromError(
  err: unknown
): { motivo: string; foto: string | null; fullName: string | null } | undefined {
  if (!(err instanceof ApiError) || err.body == null) return undefined
  const { motivo } = err.body
  if (typeof motivo !== "string") return undefined
  return {
    motivo,
    foto: typeof err.body.foto === "string" ? err.body.foto : null,
    fullName: typeof err.body.fullName === "string" ? err.body.fullName : null,
  }
}

function formatEventLabel(ev: ApiEvent): string {
  const d = new Date(ev.date)
  const dateStr = Number.isNaN(d.getTime())
    ? ev.date
    : d.toLocaleString("es-AR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
  return `${ev.name} · ${dateStr}`
}

function errorHeadline(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("lista de admisión")) return "¡Lista de admisión!"
  if (m.includes("otro evento")) return "¡Evento incorrecto!"
  if (m.includes("ya usado")) return "¡Ya usado!"
  if (m.includes("inválido")) return "¡QR no válido!"
  return "No se pudo validar"
}

/** Tarea 3.1 — Edad en años cumplidos a partir de una fecha de nacimiento ISO (chequeo +18). */
function ageFromBirthDate(iso: string): number {
  const b = new Date(iso)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const monthDiff = now.getMonth() - b.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function ScannerPage() {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const isSecurity = role === "SECURITY"
  const scannerBackHref = isSecurity ? "/settings" : "/"

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string>("")

  const [cameraOn, setCameraOn] = useState(true)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoomValue, setZoomValue] = useState(1)

  /** Tarea 3.1 — Modo de lectura: QR de entrada (default) o código de barras del DNI físico. */
  const [mode, setMode] = useState<ScanMode>("qr")

  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [sessionOk, setSessionOk] = useState(0)

  /** Tarea 3.1 — Paso mínimo del guardia: el documento escaneado no trae fecha de nacimiento
   * (libreta verde) y el evento exige +18: hay que cargarla para validar la edad. */
  const [dniDatePrompt, setDniDatePrompt] = useState<{ dni: string } | null>(null)
  const [promptBirthDate, setPromptBirthDate] = useState("")
  const [dniPhotoScanning, setDniPhotoScanning] = useState(false)
  const [manualDniOpen, setManualDniOpen] = useState(false)
  const [manualDni, setManualDni] = useState("")
  const [manualDniError, setManualDniError] = useState<string | null>(null)

  const inFlightRef = useRef(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dniPhotoInputRef = useRef<HTMLInputElement | null>(null)

  // --- Tarea 3.1 — ciclo de vida del escáner de DNI (QR, PDF417 y barras legacy) ----------
  const dniScannerRef = useRef<Html5Qrcode | null>(null)
  const dniRunRef = useRef(0)
  const dniShouldScanRef = useRef(false)

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  /** Tarea 3.2 — Cambio de evento en puerta: se persiste para la próxima sesión. */
  const handleEventChange = (id: string) => {
    setSelectedEventId(id)
    localStorage.setItem(SCANNER_EVENT_STORAGE_KEY, id)
  }

  const loadEvents = useCallback(async () => {
    if (!token) return
    setEventsError(null)
    setEventsLoading(true)
    try {
      const data = await apiFetch<{ events: ApiEvent[] }>("/events", {
        method: "GET",
        token,
      })
      // Tarea 11.3 — `isActive` retirado del modelo: la puerta ofrece eventos no cerrados.
      const list = data.events.filter((e) => e.status !== "closed")
      setEvents(list)
      setSelectedEventId((prev) => {
        if (prev && list.some((e) => e.id === prev)) return prev
        // Tarea 3.2 — Si el guardia ya eligió un evento antes (localStorage), se respeta;
        // la puerta arranca lista sin volver a elegir.
        const saved = localStorage.getItem(SCANNER_EVENT_STORAGE_KEY)
        if (saved && list.some((e) => e.id === saved)) return saved
        return list[0]?.id ?? ""
      })
    } catch (err) {
      setEvents([])
      setEventsError(
        err instanceof ApiError ? err.message : "No se pudieron cargar los eventos"
      )
    } finally {
      setEventsLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  const clearSuccessTimer = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }

  const dismissOverlay = () => {
    clearSuccessTimer()
    setOverlay(null)
    inFlightRef.current = false
  }

  const handleScan = useCallback(
    async (codes: { rawValue: string }[]) => {
      if (!token || !selectedEventId || overlay || inFlightRef.current) return
      const raw = codes[0]?.rawValue
      if (!raw) return

      const qrHash = parseQrHash(raw)
      if (!qrHash) return

      inFlightRef.current = true

      try {
        const res = await apiFetch<ValidateResponse>("/tickets/validate", {
          method: "POST",
          token,
          body: JSON.stringify({ qrHash, eventId: selectedEventId }),
        })

        playScannerSound("success")
        const name =
          res.ticket.buyerName?.trim() || "Asistente"
        const typeName = res.ticketTypeName || "Entrada"
        setOverlay({
          kind: "success",
          buyerName: name,
          // Tarea 3.2 — el chip del tipo de entrada se colorea con este id.
          ticketTypeId: res.ticketTypeId,
          ticketTypeName: typeName,
        })
        setSessionOk((n) => n + 1)

        clearSuccessTimer()
        successTimerRef.current = setTimeout(() => {
          dismissOverlay()
        }, 1500)
      } catch (err) {
        playScannerSound("error")
        const msg =
          err instanceof ApiError ? err.message : "Error de red. Probá de nuevo."
        // Tarea 3.2 — blacklist: el 403 trae motivo + foto (R2) + nombre; la pantalla los
        // muestra en grande para que el guardia identifique a la persona.
        const blacklist = blacklistFromError(err)
        setOverlay({
          kind: "error",
          headline: errorHeadline(msg),
          detail: msg,
          blacklist,
        })
        inFlightRef.current = false
      }
    },
    [token, selectedEventId, overlay]
  )

  /** Tarea 1.4 — Valida la entrada por DNI: mismo endpoint de lógica que el QR, resuelto por
   * `tickets.buyer_dni`. La blacklist ya la chequea el backend (403 con motivo/foto). */
  const validateDni = useCallback(
    async (dni: string) => {
      if (!token || !selectedEventId) return
      inFlightRef.current = true
      try {
        const res = await apiFetch<ValidateByDniResponse>(
          "/tickets/validate-by-dni",
          {
            method: "POST",
            token,
            body: JSON.stringify({ eventId: selectedEventId, dni }),
          }
        )

        playScannerSound("success")
        const name = res.buyerName?.trim() || "Asistente"
        const typeName = res.ticketTypeName || "Entrada"
        setOverlay({
          kind: "success",
          buyerName: name,
          // Tarea 3.2 — el chip del tipo de entrada se colorea con este id.
          ticketTypeId: res.ticketTypeId,
          ticketTypeName: typeName,
          reentry: res.reentry === true,
          gatePassCount: res.gatePassCount,
        })
        setSessionOk((n) => n + 1)

        clearSuccessTimer()
        successTimerRef.current = setTimeout(() => {
          dismissOverlay()
        }, 1500)
      } catch (err) {
        playScannerSound("error")
        const msg =
          err instanceof ApiError ? err.message : "Error de red. Probá de nuevo."
        // Tarea 3.2 — blacklist: el 403 trae motivo + foto (R2) + nombre; la pantalla los
        // muestra en grande para que el guardia identifique a la persona.
        const blacklist = blacklistFromError(err)
        setOverlay({
          kind: "error",
          headline: errorHeadline(msg),
          detail: msg,
          blacklist,
        })
        inFlightRef.current = false
      }
    },
    [token, selectedEventId]
  )

  /** Tarea 3.1 — Un código de barras de DNI escaneado: parsea el documento, chequea +18
   * (si el evento lo exige) y recién entonces valida la entrada por DNI. */
  const handleDniScan = useCallback(
    async (raw: string) => {
      if (!token || !selectedEventId || overlay || dniDatePrompt || inFlightRef.current)
        return

      const parsed = parseDniBarcode(raw)
      if (!parsed) {
        playScannerSound("error")
        setOverlay({
          kind: "error",
          headline: "Código no reconocido",
          detail: "Escaneá el QR o código de barras de la parte de atrás del DNI.",
        })
        return
      }

      const restriction = selectedEvent?.ageRestriction ?? null
      if (restriction != null && restriction > 0) {
        if (!parsed.birthDate) {
          // Libreta verde: no trae fecha de nacimiento → paso mínimo del guardia (3.1).
          setDniDatePrompt({ dni: parsed.dni })
          return
        }
        const age = ageFromBirthDate(parsed.birthDate)
        if (age < restriction) {
          playScannerSound("error")
          setOverlay({
            kind: "error",
            headline: "Menor de edad",
            detail: `El evento es +${restriction} y esta persona tiene ${age} años.`,
          })
          return
        }
      }

      void validateDni(parsed.dni)
    },
    [token, selectedEventId, overlay, dniDatePrompt, validateDni, selectedEvent]
  )

  const handleDniScanRef = useRef(handleDniScan)
  handleDniScanRef.current = handleDniScan

  const stopDniScanner = useCallback(async () => {
    // Invalida cualquier arranque en vuelo (un `start()` pendiente de la cámara se auto-detiene
    // al resolver) y suelta la cámara del escáner activo.
    dniRunRef.current++
    const s = dniScannerRef.current
    dniScannerRef.current = null
    setTorchAvailable(false)
    setTorchOn(false)
    setZoomRange(null)
    if (s?.isScanning) {
      try {
        await s.stop()
      } catch {
        // Cámara ya liberada o detenida en paralelo: no es un error de la puerta.
      }
    }
  }, [])

  const startDniScanner = useCallback(async () => {
    if (!document.getElementById(DNI_SCANNER_ELEMENT_ID)) return
    const run = ++dniRunRef.current
    // Suelta el escáner anterior SIN invalidar este arranque (stopDniScanner sí lo haría).
    const prev = dniScannerRef.current
    dniScannerRef.current = null
    if (prev?.isScanning) {
      try {
        await prev.stop()
      } catch {
        // Cámara ya liberada: no es un error.
      }
    }
    if (run !== dniRunRef.current) return

    const attempt = async (tryCount: number): Promise<void> => {
      if (run !== dniRunRef.current || !dniShouldScanRef.current) return
      const s = new Html5Qrcode(DNI_SCANNER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: DNI_SUPPORTED_FORMATS,
        // Chrome/Android puede delegar al detector nativo; ZXing sigue siendo el fallback
        // automático en navegadores sin BarcodeDetector.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      })
      if (run !== dniRunRef.current) return
      dniScannerRef.current = s
      try {
        await s.start(
          {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [
              { focusMode: "continuous" } as ExtendedMediaTrackConstraintSet,
            ],
          },
          {
            fps: 10,
            // Un cuadro cuadrado sirve para el QR nuevo y sigue dejando entrar completo el
            // PDF417/código de barras horizontal de los documentos anteriores.
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8)
              return { width: size, height: size }
            },
          },
          (decodedText) => handleDniScanRef.current(decodedText),
          () => {
            /* errores por frame: silenciosos */
          }
        )
        if (run === dniRunRef.current && dniShouldScanRef.current) {
          try {
            const capabilities = s.getRunningTrackCapabilities() as ExtendedMediaTrackCapabilities
            const settings = s.getRunningTrackSettings() as MediaTrackSettings & { zoom?: number }
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
              setZoomValue(
                Math.min(range.max, Math.max(range.min, settings.zoom ?? range.min))
              )
            } else {
              setZoomRange(null)
            }
          } catch {
            // Algunos navegadores exponen cámara pero no sus capacidades avanzadas.
            setTorchAvailable(false)
            setZoomRange(null)
          }
        }
        // Invalidado mientras arrancaba (overlay, cambio de evento/modo, cámara off):
        // el escáner no debe quedar encendido aunque la cámara ya se haya adquirido.
        if (run !== dniRunRef.current || !dniShouldScanRef.current) {
          dniScannerRef.current = null
          if (s.isScanning) {
            try {
              await s.stop()
            } catch {
              // ya detenida
            }
          }
        }
      } catch {
        // Cámara en uso (permiso negado o el lector de QR recién se apagó): reintenta una vez.
        dniScannerRef.current = null
        if (
          run === dniRunRef.current &&
          tryCount < 2 &&
          dniShouldScanRef.current
        ) {
          setTimeout(() => void attempt(tryCount + 1), 500)
        }
      }
    }

    await attempt(1)
  }, [facingMode, stopDniScanner])

  const dniScanningActive =
    mode === "dni" &&
    !!selectedEventId &&
    cameraOn &&
    overlay === null &&
    dniDatePrompt === null &&
    !dniPhotoScanning &&
    !manualDniOpen &&
    !!token
  dniShouldScanRef.current = dniScanningActive

  useEffect(() => {
    if (!dniScanningActive) {
      void stopDniScanner()
      return
    }
    void startDniScanner()
    return () => {
      void stopDniScanner()
    }
  }, [dniScanningActive, startDniScanner, stopDniScanner])

  const switchMode = (next: ScanMode) => {
    setMode(next)
    if (next === "qr") {
      // El prompt de fecha solo vive en modo DNI.
      setDniDatePrompt(null)
      setPromptBirthDate("")
      setManualDniOpen(false)
      setManualDni("")
      setManualDniError(null)
    }
  }

  const toggleTorch = async () => {
    const scanner = dniScannerRef.current
    if (!scanner?.isScanning || !torchAvailable) return
    const next = !torchOn
    try {
      await scanner.applyVideoConstraints({
        advanced: [{ torch: next } as ExtendedMediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
      setTorchOn(false)
    }
  }

  const applyZoom = async (value: number) => {
    const scanner = dniScannerRef.current
    setZoomValue(value)
    if (!scanner?.isScanning || !zoomRange) return
    try {
      await scanner.applyVideoConstraints({
        advanced: [{ zoom: value } as ExtendedMediaTrackConstraintSet],
      })
    } catch {
      setZoomRange(null)
    }
  }

  const handleDniPhoto = async (file: File | null) => {
    if (!file || !token || !selectedEventId || overlay || inFlightRef.current) return
    setDniPhotoScanning(true)
    await stopDniScanner()
    let fileScanner: Html5Qrcode | null = null
    try {
      fileScanner = new Html5Qrcode(DNI_FILE_SCANNER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: DNI_SUPPORTED_FORMATS,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      })
      const result = await fileScanner.scanFileV2(file, false)
      await handleDniScanRef.current(result.decodedText)
    } catch {
      playScannerSound("error")
      setOverlay({
        kind: "error",
        headline: "No se pudo leer el DNI",
        detail: "Acercá el QR, evitá reflejos y sacá la foto nuevamente.",
      })
    } finally {
      try {
        fileScanner?.clear()
      } catch {
        // El lector de archivo ya había limpiado su canvas.
      }
      if (dniPhotoInputRef.current) dniPhotoInputRef.current.value = ""
      setDniPhotoScanning(false)
    }
  }

  const openManualDni = () => {
    setManualDni("")
    setManualDniError(null)
    setManualDniOpen(true)
  }

  const confirmManualDni = () => {
    const dni = manualDni.replace(/\D/g, "").replace(/^0+/, "")
    if (dni.length < 6 || dni.length > 9) {
      setManualDniError("Ingresá un DNI válido, sin puntos.")
      return
    }
    setManualDniOpen(false)
    setManualDni("")
    setManualDniError(null)
    const restriction = selectedEvent?.ageRestriction ?? null
    if (restriction != null && restriction > 0) {
      setDniDatePrompt({ dni })
      return
    }
    void validateDni(dni)
  }

  const confirmPromptBirthDate = () => {
    if (!dniDatePrompt || !promptBirthDate) return
    const dni = dniDatePrompt.dni
    const restriction = selectedEvent?.ageRestriction ?? null
    setDniDatePrompt(null)
    setPromptBirthDate("")
    if (restriction != null && restriction > 0) {
      const age = ageFromBirthDate(promptBirthDate)
      if (age < restriction) {
        playScannerSound("error")
        setOverlay({
          kind: "error",
          headline: "Menor de edad",
          detail: `El evento es +${restriction} y esta persona tiene ${age} años.`,
        })
        return
      }
    }
    void validateDni(dni)
  }

  const scannerPaused =
    !cameraOn ||
    !selectedEventId ||
    overlay !== null ||
    dniDatePrompt !== null ||
    dniPhotoScanning ||
    manualDniOpen ||
    !token

  /** Tarea 3.2 — Color del chip del tipo de entrada del overlay activo (si es un éxito). */
  const successColor =
    overlay?.kind === "success"
      ? ticketTypeColor(overlay.ticketTypeId, overlay.ticketTypeName)
      : null

  const scannerMain = (
    <div
      className={cn(
        "flex flex-col bg-black text-white",
        isSecurity ? "min-h-0 flex-1" : "min-h-svh"
      )}
    >
      <header className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-3 backdrop-blur-xl bg-black/70 sm:px-5">
        <Link
          to={scannerBackHref}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#98989D] transition-colors active:opacity-70"
          aria-label="Volver"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="min-w-0 flex-1 px-2 text-center">
          <h1 className="truncate text-[17px] font-bold tracking-tight">
            Control de acceso
          </h1>
          <p className="truncate text-[13px] text-[#98989D]">
            {selectedEvent ? selectedEvent.name : "Elegí un evento"}
          </p>
        </div>
        <div className="w-10 shrink-0" />
      </header>

      <div className="border-b border-zinc-800/50 bg-black/50 px-4 py-4 sm:px-5">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93]">
          Evento
        </label>
        {eventsLoading ? (
          <p className="text-sm text-neutral-500">Cargando eventos…</p>
        ) : eventsError ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-red-400">{eventsError}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[#FF9500] hover:text-[#FF9500]/90"
              onClick={() => void loadEvents()}
            >
              Reintentar
            </Button>
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay eventos activos. Creá uno en el panel de eventos.
          </p>
        ) : (
          <Select value={selectedEventId} onValueChange={handleEventChange}>
            <SelectTrigger className="h-12 w-full rounded-xl border-zinc-700 bg-[#1C1C1E] text-[15px] text-white">
              <SelectValue placeholder="Seleccionar evento" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-zinc-700 bg-[#1C1C1E] text-white">
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id} className="text-base">
                  {formatEventLabel(ev)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tarea 3.1 — Alternar QR de entrada / DNI físico. */}
      <div className="mx-auto mt-4 flex w-full max-w-lg gap-1 rounded-xl border border-zinc-800 bg-[#1C1C1E] p-1">
        <button
          type="button"
          onClick={() => switchMode("qr")}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-colors",
            mode === "qr"
              ? "bg-[#FF9500] text-white"
              : "text-[#98989D] hover:text-white"
          )}
        >
          <QrCode className="h-4 w-4" />
          Código QR
        </button>
        <button
          type="button"
          onClick={() => switchMode("dni")}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-colors",
            mode === "dni"
              ? "bg-[#FF9500] text-white"
              : "text-[#98989D] hover:text-white"
          )}
        >
          <IdCard className="h-4 w-4" />
          DNI físico
        </button>
      </div>

      {sessionOk > 0 && (
        <div className="flex items-center justify-center gap-2 border-b border-zinc-800/50 bg-white/5 py-2.5 text-[13px] font-medium text-[#98989D]">
          <ScanLine className="h-4 w-4 text-[#FF9500]" />
          <span>Validados en esta sesión: {sessionOk}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col px-3 py-4 sm:px-4">
        <div
          className={cn(
            "relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border-2 bg-black",
            scannerPaused ? "border-zinc-800" : "border-[#FF9500]/50"
          )}
          style={{ aspectRatio: "1" }}
        >
          {selectedEventId && cameraOn && token ? (
            mode === "qr" ? (
              <Scanner
                onScan={(detected) => void handleScan(detected)}
                constraints={{ facingMode }}
                paused={scannerPaused}
                sound={false}
                scanDelay={600}
                components={{ torch: false }}
                onError={() => {
                  /* cámara: errores silenciosos; el usuario puede reiniciar */
                }}
                classNames={{
                  container: "h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover",
                }}
              />
            ) : (
              <div
                id={DNI_SCANNER_ELEMENT_ID}
                className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
              />
            )
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 bg-neutral-900 p-6 text-center">
              <CameraOff className="h-14 w-14 text-neutral-600" />
              <p className="text-sm text-neutral-500">
                {!selectedEventId
                  ? "Seleccioná un evento para activar el lector."
                  : !cameraOn
                    ? "Cámara detenida. Tocá «Iniciar cámara»."
                    : "Iniciá sesión para usar el escáner."}
              </p>
            </div>
          )}

          {!scannerPaused && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent py-4 text-center">
              <p className="text-[13px] font-semibold tracking-wide text-[#FF9500]">
                {mode === "qr" ? "Buscando QR…" : "Buscando DNI…"}
              </p>
            </div>
          )}

          {dniPhotoScanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              <RefreshCw className="h-10 w-10 animate-spin text-[#FF9500]" />
              <p className="text-sm font-semibold text-white">Leyendo foto en alta resolución…</p>
            </div>
          )}
        </div>

        {/* html5-qrcode necesita un contenedor real para procesar archivos aunque no muestre
            la imagen capturada. Vive fuera del visor para no interferir con la cámara. */}
        <div id={DNI_FILE_SCANNER_ELEMENT_ID} className="hidden" aria-hidden="true" />

        {mode === "dni" && (
          <div className="mx-auto mt-4 w-full max-w-lg space-y-3">
            {(torchAvailable || zoomRange) && (
              <div className="rounded-xl border border-zinc-800 bg-[#1C1C1E] p-3">
                <div className="flex items-center gap-3">
                  {torchAvailable && (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 shrink-0 gap-2 rounded-xl border-zinc-700",
                        torchOn
                          ? "border-[#FF9500] bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
                          : "bg-transparent text-white hover:bg-white/5"
                      )}
                      onClick={() => void toggleTorch()}
                    >
                      <Flashlight className="h-4 w-4" />
                      {torchOn ? "Apagar luz" : "Encender luz"}
                    </Button>
                  )}
                  {zoomRange && (
                    <label className="min-w-0 flex-1">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-[#98989D]">
                        <span className="flex items-center gap-1.5">
                          <ZoomIn className="h-3.5 w-3.5" />
                          Zoom
                        </span>
                        <span>{zoomValue.toFixed(1)}×</span>
                      </span>
                      <input
                        type="range"
                        min={zoomRange.min}
                        max={zoomRange.max}
                        step={zoomRange.step}
                        value={zoomValue}
                        onChange={(e) => void applyZoom(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-[#FF9500]"
                        aria-label="Zoom de cámara"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            <input
              ref={dniPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void handleDniPhoto(e.target.files?.[0] ?? null)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-12 gap-2 rounded-xl border-zinc-700 bg-transparent text-[14px] font-semibold text-white hover:bg-white/5"
                onClick={() => dniPhotoInputRef.current?.click()}
                disabled={!selectedEventId || !token || dniPhotoScanning}
              >
                <ImagePlus className="h-5 w-5" />
                Sacar foto
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-12 gap-2 rounded-xl border-zinc-700 bg-transparent text-[14px] font-semibold text-white hover:bg-white/5"
                onClick={openManualDni}
                disabled={!selectedEventId || !token || dniPhotoScanning}
              >
                <Keyboard className="h-5 w-5" />
                Ingresar DNI
              </Button>
            </div>
          </div>
        )}

        <div className="mx-auto mt-6 flex w-full max-w-lg flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            size="lg"
            variant={cameraOn ? "outline" : "default"}
            className={cn(
              "h-12 min-h-12 flex-1 gap-2 rounded-xl text-[15px] font-semibold",
              cameraOn
                ? "border-zinc-700 bg-transparent text-white hover:bg-white/5"
                : "border-0 bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
            )}
            onClick={() => setCameraOn((v) => !v)}
            disabled={!selectedEventId || !token}
          >
            {cameraOn ? (
              <>
                <CameraOff className="h-5 w-5" />
                Detener cámara
              </>
            ) : (
              <>
                <Camera className="h-5 w-5" />
                Iniciar cámara
              </>
            )}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 min-h-12 flex-1 gap-2 rounded-xl border-zinc-700 bg-transparent text-[15px] font-semibold text-white hover:bg-white/5"
            onClick={() =>
              setFacingMode((m) => (m === "environment" ? "user" : "environment"))
            }
            disabled={!cameraOn || !selectedEventId || !token}
          >
            <SwitchCamera className="h-5 w-5" />
            Cambiar cámara
          </Button>
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-[13px] leading-relaxed text-[#636366]">
          {mode === "qr"
            ? "Apuntá al código de la entrada."
            : "Apuntá al QR o código de barras de la parte de atrás del DNI."}
        </p>
      </div>

      {overlay?.kind === "success" && successColor && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-emerald-500 px-6 text-center text-neutral-950"
          role="alert"
        >
          {/* Tarea 3.2 — Chip del tipo de entrada: el color identifica el tipo de un vistazo
              (VIP = dorado, General = blanco; tipos custom → paleta por hash del id). */}
          <span
            className={cn(
              "rounded-full px-6 py-2 text-xl font-black uppercase tracking-widest shadow-2xl sm:text-2xl",
              successColor.chip,
              successColor.halo
            )}
          >
            {overlay.ticketTypeName}
          </span>
          <p className="mt-7 text-4xl font-black tracking-tight sm:text-5xl">
            {overlay.reentry ? "¡Reingreso!" : "¡Ticket válido!"}
          </p>
          {/* Tarea 3.2 — Nombre grande: se lee desde la fila (visión §2.4). */}
          <p className="mt-4 w-full max-w-3xl truncate text-5xl font-black leading-tight sm:text-7xl">
            {overlay.buyerName}
          </p>
          <p className="mt-7 text-lg font-medium opacity-90 sm:text-xl">
            {overlay.reentry
              ? overlay.gatePassCount
                ? `Ya entró — reingreso (pase #${overlay.gatePassCount})`
                : "Ya entró — reingreso"
              : "Ingreso autorizado"}
          </p>
        </div>
      )}

      {overlay?.kind === "error" && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-red-600 px-6 text-center text-white"
          role="alert"
        >
          <p className="text-4xl font-black tracking-tight sm:text-5xl">
            {overlay.headline}
          </p>
          {overlay.blacklist ? (
            <>
              {/* Tarea 3.2 — Blacklist: foto cargada en R2 + nombre + motivo en grande. Sin
                  foto, un ícono ocupa el lugar para que el guardia igual tenga el bloque. */}
              {overlay.blacklist.foto ? (
                <img
                  src={overlay.blacklist.foto}
                  alt="Foto de la persona en la lista de admisión"
                  className="mt-6 h-44 w-44 rounded-2xl border-4 border-white/80 object-cover shadow-2xl sm:h-52 sm:w-52"
                />
              ) : (
                <div className="mt-6 flex h-44 w-44 items-center justify-center rounded-2xl border-4 border-white/30 bg-black/20 sm:h-52 sm:w-52">
                  <UserX className="h-16 w-16 opacity-80" />
                </div>
              )}
              <p className="mt-4 text-3xl font-black">
                {overlay.blacklist.fullName ?? "Persona sin nombre"}
              </p>
              <p className="mt-2 max-w-md text-lg font-medium opacity-95">
                Motivo: {overlay.blacklist.motivo}
              </p>
            </>
          ) : (
            <p className="mt-4 max-w-md text-lg font-medium opacity-95">
              {overlay.detail}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="mt-10 h-16 min-w-[min(100%,280px)] text-lg font-bold bg-white text-red-600 hover:bg-neutral-100"
            onClick={dismissOverlay}
          >
            <RefreshCw className="mr-2 h-6 w-6" />
            Volver a intentar
          </Button>
        </div>
      )}

      {/* Tarea 3.1 — Paso mínimo del guardia: fecha de nacimiento para el +18 cuando el
          código del documento (libreta verde) no la trae. */}
      {dniDatePrompt && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#1C1C1E] p-6 text-white">
            <h2 className="text-lg font-bold">Control de edad</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#98989D]">
              Este documento no trae la fecha de nacimiento en el código. Ingresala para
              validar el +{selectedEvent?.ageRestriction ?? 18} del evento.
            </p>
            <input
              type="date"
              value={promptBirthDate}
              onChange={(e) => setPromptBirthDate(e.target.value)}
              className="mt-4 h-12 w-full rounded-xl border border-zinc-700 bg-[#0C0C0E] px-3 text-[15px] text-white [color-scheme:dark]"
            />
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-12 flex-1 rounded-xl border border-zinc-700 text-white hover:bg-white/5"
                onClick={() => {
                  setDniDatePrompt(null)
                  setPromptBirthDate("")
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 flex-1 rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
                disabled={!promptBirthDate}
                onClick={confirmPromptBirthDate}
              >
                Validar
              </Button>
            </div>
          </div>
        </div>
      )}

      {manualDniOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-dni-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#1C1C1E] p-6 text-white">
            <h2 id="manual-dni-title" className="text-lg font-bold">Ingresar DNI</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#98989D]">
              Usalo cuando el documento esté dañado o la cámara no consiga enfocarlo.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={manualDni}
              onChange={(e) => {
                setManualDni(e.target.value.replace(/\D/g, "").slice(0, 9))
                setManualDniError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmManualDni()
              }}
              placeholder="Ej. 40123456"
              className="mt-4 h-12 w-full rounded-xl border border-zinc-700 bg-[#0C0C0E] px-3 text-[17px] tracking-wide text-white outline-none focus:border-[#FF9500]"
              aria-invalid={manualDniError != null}
            />
            {manualDniError && (
              <p className="mt-2 text-sm font-medium text-red-400">{manualDniError}</p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-12 flex-1 rounded-xl border border-zinc-700 text-white hover:bg-white/5"
                onClick={() => {
                  setManualDniOpen(false)
                  setManualDni("")
                  setManualDniError(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 flex-1 rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
                disabled={manualDni.length < 6}
                onClick={confirmManualDni}
              >
                Validar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (!isSecurity) return scannerMain

  return (
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex min-h-0 flex-1 flex-col">{scannerMain}</div>
      </div>
    </div>
  )
}
