import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, RefreshCw, Store } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { ApiError, publicApiFetch } from "@/lib/api"
import type { StaffProfile } from "@/stores/auth-store"

type DeviceLink = {
  code: string
  secret: string
  access: "pos" | "security" | null
  expiresAt: string
  /** URL pública que abre el teléfono al escanear. La arma el backend con `ADMIN_URL`. */
  url: string
}

/** Barra que quien aprobó (ADMIN/MANAGER) fijó a esta computadora desde el teléfono. */
export type DeviceLinkAssignment = {
  eventId: string
  eventName: string
  barId: string
  barName: string
}

/** Lo que el teléfono decidió sobre la barra de ESTA computadora. */
export type DeviceLinkDecision = {
  assignment: DeviceLinkAssignment | null
  /**
   * False = quien aprobó no opinó (o no tenía potestad): la fijación local no se toca. Distinto de
   * `assignment: null` con `decided: true`, que significa "quitar la barra de esta computadora".
   */
  decided: boolean
}

type ClaimResponse =
  | { status: "pending" }
  | { status: "expired" }
  | {
      status: "approved"
      token: string
      staff: StaffProfile
      // Opcionales a propósito: toleran un backend previo durante un deploy solapado.
      assignment?: DeviceLinkAssignment | null
      assignmentDecided?: boolean
    }

/** Cada cuánto el equipo pregunta si el teléfono ya aprobó. */
const POLL_MS = 2000

/**
 * Vinculación de equipo por QR (estilo WhatsApp Web): la computadora muestra un código y el
 * teléfono que ya tiene sesión staff lo aprueba desde Crow web. Recién ahí el backend entrega la
 * sesión, que es la de esa persona: vincular no comparte contraseña ni agrega permisos.
 *
 * Si el módulo es el POS y quien aprueba es ADMIN o MANAGER, el teléfono puede además fijar qué
 * barra es esta computadora; esa decisión llega en el claim y la aplica quien recibe `onLinked`.
 */
export function DeviceLinkPanel({
  access,
  title,
  icon: Icon,
  onLinked,
  onBack,
  onUseThisDevice,
}: {
  access: "pos" | "security"
  title: string
  icon: typeof Store
  onLinked: (token: string, staff: StaffProfile, decision: DeviceLinkDecision) => void
  onBack: () => void
  onUseThisDevice: () => void
}) {
  const [link, setLink] = useState<DeviceLink | null>(null)
  const [creating, setCreating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  // Evita solapar dos reclamos si el intervalo dispara mientras una respuesta está en vuelo.
  const claimingRef = useRef(false)
  const onLinkedRef = useRef(onLinked)
  onLinkedRef.current = onLinked

  const createLink = useCallback(async () => {
    setCreating(true)
    setError(null)
    setExpired(false)
    setLink(null)
    try {
      const data = await publicApiFetch<{ deviceLink: DeviceLink }>("/staff/device-links", {
        method: "POST",
        body: JSON.stringify({ access }),
      })
      setLink(data.deviceLink)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el código")
    } finally {
      setCreating(false)
    }
  }, [access])

  useEffect(() => {
    void createLink()
  }, [createLink])

  useEffect(() => {
    if (!link) return
    let cancelled = false
    let stopped = false

    const poll = async () => {
      if (cancelled || stopped || claimingRef.current) return
      claimingRef.current = true
      try {
        const data = await publicApiFetch<ClaimResponse>("/staff/device-links/claim", {
          method: "POST",
          body: JSON.stringify({ code: link.code, secret: link.secret }),
        })
        if (cancelled || stopped) return
        if (data.status === "approved") {
          stopped = true
          clearInterval(timer)
          onLinkedRef.current(data.token, data.staff, {
            assignment: data.assignment ?? null,
            decided: data.assignmentDecided === true,
          })
          return
        }
        if (data.status === "expired") {
          stopped = true
          clearInterval(timer)
          setExpired(true)
        }
      } catch (err) {
        if (cancelled || stopped) return
        // Un fallo de red no corta la espera: el código sigue vivo hasta que venza. Un error de la
        // API (código reclamado, cuenta dada de baja) sí es terminal y se muestra tal cual.
        if (err instanceof ApiError) {
          stopped = true
          clearInterval(timer)
          setError(err.message)
          setExpired(true)
        }
      } finally {
        claimingRef.current = false
      }
    }

    const timer = setInterval(() => void poll(), POLL_MS)
    void poll()
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [link])

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Cambiar módulo
      </button>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[#FF9500]">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">{title}</h1>

      {expired || error ? (
        <div className="mt-6 space-y-4">
          <p
            className="rounded-2xl border border-amber-200/40 bg-amber-50/10 px-4 py-3 text-sm leading-relaxed text-amber-100/90"
            role="alert"
          >
            {error ?? "El código venció. Generá uno nuevo para vincular esta computadora."}
          </p>
          <button
            type="button"
            onClick={() => void createLink()}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#FF9500] px-5 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" /> Generar un código nuevo
          </button>
        </div>
      ) : (
        <>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/50">
            Escaneá el código con tu teléfono desde Crow, con tu sesión ya iniciada. Esta computadora
            va a entrar con esa cuenta.
          </p>
          {access === "pos" ? (
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-white/35">
              Si quien escanea es administrador o encargado, también elige qué barra es esta
              computadora.
            </p>
          ) : null}
          <div className="mx-auto mt-7 flex h-[216px] w-[216px] items-center justify-center rounded-3xl bg-white p-4 shadow-2xl shadow-black/30">
            {link ? (
              <QRCodeSVG value={link.url} size={184} level="M" includeMargin />
            ) : (
              <span className="text-sm text-zinc-500">
                {creating ? "Generando código…" : "Sin código"}
              </span>
            )}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-white/35">
            El código vence en unos minutos y sólo vincula esta computadora. Tu contraseña nunca sale
            del teléfono.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onUseThisDevice}
        className="mt-6 text-sm text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        Iniciar sesión en esta computadora
      </button>
    </div>
  )
}
