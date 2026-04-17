import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { Scanner } from "@yudiel/react-qr-scanner"
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
import { playScannerSound } from "@/lib/scanner-sound"
import { useAuthStore } from "@/stores/auth-store"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import type { ApiEvent } from "@/types/events"
import {
  Camera,
  CameraOff,
  ChevronLeft,
  RefreshCw,
  ScanLine,
  SwitchCamera,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ValidateResponse = {
  message: string
  ticket: {
    id: string
    buyerName: string | null
    buyerEmail: string | null
  }
  ticketTypeName: string
}

type OverlayState =
  | {
      kind: "success"
      buyerName: string
      ticketTypeName: string
    }
  | {
      kind: "error"
      headline: string
      detail: string
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
  if (m.includes("otro evento")) return "¡Evento incorrecto!"
  if (m.includes("ya usado")) return "¡Ya usado!"
  if (m.includes("inválido")) return "¡QR no válido!"
  return "No se pudo validar"
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

  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [sessionOk, setSessionOk] = useState(0)

  const inFlightRef = useRef(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  const loadEvents = useCallback(async () => {
    if (!token) return
    setEventsError(null)
    setEventsLoading(true)
    try {
      const data = await apiFetch<{ events: ApiEvent[] }>("/events", {
        method: "GET",
        token,
      })
      const list = data.events.filter((e) => e.isActive !== false)
      setEvents(list)
      setSelectedEventId((prev) => {
        if (prev && list.some((e) => e.id === prev)) return prev
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
        setOverlay({
          kind: "error",
          headline: errorHeadline(msg),
          detail: msg,
        })
        inFlightRef.current = false
      }
    },
    [token, selectedEventId, overlay]
  )

  const scannerPaused =
    !cameraOn || !selectedEventId || overlay !== null || !token

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
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
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
                Buscando QR…
              </p>
            </div>
          )}
        </div>

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
          Apuntá al código de la entrada.
        </p>
      </div>

      {overlay?.kind === "success" && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-emerald-500 px-6 text-center text-neutral-950"
          role="alert"
        >
          <p className="text-4xl font-black tracking-tight sm:text-5xl">
            ¡Ticket válido!
          </p>
          <p className="mt-6 text-2xl font-bold sm:text-3xl">{overlay.buyerName}</p>
          <p className="mt-2 text-lg font-medium opacity-90">
            {overlay.ticketTypeName}
          </p>
          <p className="mt-8 text-sm font-medium opacity-80">Ingreso autorizado</p>
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
          <p className="mt-4 max-w-md text-lg font-medium opacity-95">
            {overlay.detail}
          </p>
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
