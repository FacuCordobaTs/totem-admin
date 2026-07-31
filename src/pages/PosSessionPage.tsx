import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Check, Delete, Loader2, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { publicApiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { usePosSessionStore } from "@/stores/pos-session-store"

type SessionInfo = {
  label: string
  eventId: string
  eventName: string
  barId: string | null
  barName: string | null
}

type PinResponse = {
  token: string
  staff: StaffProfile
  shift: { eventId: string; barId: string | null; label: string }
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

export function PosSessionPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setSession = usePosSessionStore((s) => s.setSession)
  const clearSession = usePosSessionStore((s) => s.clear)

  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await publicApiFetch<{ session: SessionInfo }>(
        `/staff/pos-sessions/${token}`
      )
      setInfo(data.session)
    } catch (err) {
      clearSession()
      setLoadError(
        err instanceof ApiError ? err.message : "No se pudo abrir la sesión de puesto"
      )
    } finally {
      setLoading(false)
    }
  }, [token, setSession, clearSession])

  useEffect(() => {
    void load()
  }, [load])

  const submit = useCallback(
    async (value: string) => {
      if (!token || submitting || !info) return
      setSubmitting(true)
      setError(null)
      try {
        const data = await publicApiFetch<PinResponse>(
          `/staff/pos-sessions/${token}/pin`,
          { method: "POST", body: JSON.stringify({ pin: value }) }
        )
        // Recién ahora fijamos el dispositivo al puesto: entró alguien de verdad.
        setSession({
          token,
          eventId: info.eventId,
          eventName: info.eventName,
          barId: info.barId,
          barName: info.barName,
          label: info.label,
        })
        setAuth(data.token, data.staff)
        navigate("/pos", { replace: true })
      } catch (err) {
        setPin("")
        setError(err instanceof ApiError ? err.message : "No se pudo entrar")
      } finally {
        setSubmitting(false)
      }
    },
    [token, submitting, info, setSession, setAuth, navigate]
  )

  function press(digit: string) {
    if (submitting) return
    setError(null)
    setPin((prev) => {
      if (prev.length >= 6) return prev
      const next = prev + digit
      if (next.length === 6) {
        // Con 6 dígitos ya no cabe más: confirmá automáticamente.
        void submit(next)
      }
      return next
    })
  }

  function backspace() {
    if (submitting) return
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }

  const dots = useMemo(() => Array.from({ length: 6 }), [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-white">
      {loading ? (
        <Loader2 className="h-7 w-7 animate-spin text-[#FF9500]" />
      ) : loadError ? (
        <div className="w-full max-w-sm text-center">
          <Store className="mx-auto h-8 w-8 text-white/40" />
          <p className="mt-5 text-[15px] text-white/60">{loadError}</p>
        </div>
      ) : info ? (
        <div className="w-full max-w-xs animate-in fade-in duration-500">
          <div className="mb-8 text-center">
            <p className="text-[13px] text-white/40">{info.eventName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {info.barName ?? info.label}
            </h1>
            <p className="mt-3 text-[13px] text-white/40">Entrá con tu PIN</p>
          </div>

          <div className="mb-6 flex items-center justify-center gap-3">
            {dots.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-3 w-3 rounded-full transition-colors",
                  i < pin.length ? "bg-[#FF9500]" : "bg-white/15"
                )}
              />
            ))}
          </div>

          <p
            className={cn(
              "mb-4 h-5 text-center text-[13px]",
              error ? "text-red-400" : "text-transparent"
            )}
            role="alert"
          >
            {error ?? "·"}
          </p>

          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={submitting}
                className="flex h-16 items-center justify-center rounded-2xl bg-white/[0.06] text-2xl font-medium tabular-nums transition-colors active:bg-white/[0.14] disabled:opacity-40"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void submit(pin)}
              disabled={submitting || pin.length < 4}
              className="flex h-16 items-center justify-center rounded-2xl text-[#FF9500] transition-colors active:bg-white/[0.08] disabled:opacity-30"
              aria-label="Entrar"
            >
              <Check className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => press("0")}
              disabled={submitting}
              className="flex h-16 items-center justify-center rounded-2xl bg-white/[0.06] text-2xl font-medium tabular-nums transition-colors active:bg-white/[0.14] disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              disabled={submitting || pin.length === 0}
              className="flex h-16 items-center justify-center rounded-2xl text-white/60 transition-colors active:bg-white/[0.08] disabled:opacity-30"
              aria-label="Borrar"
            >
              {submitting ? (
                <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" />
              ) : (
                <Delete className="h-6 w-6" />
              )}
            </button>
          </div>

          <p className="mt-8 text-center text-[12px] text-white/30">
            Este dispositivo quedó fijado a {info.barName ?? info.label}. Cada persona
            entra y sale con su PIN.
          </p>
        </div>
      ) : null}
    </div>
  )
}
