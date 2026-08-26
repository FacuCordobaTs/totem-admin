import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile, type StaffRole } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"
import { staffRoleLabel } from "@/lib/role-labels"
import { cn } from "@/lib/utils"

type InvitationInfo = {
  role: StaffRole
  status: "PENDING" | "ACCEPTED" | "REVOKED"
  expired: boolean
  tenantName: string | null
}

type AcceptResponse = {
  message: string
  token: string
  staff: StaffProfile
}

const inputClass =
  "h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-0 focus-visible:ring-0 focus-visible:bg-zinc-200/70 dark:focus-visible:bg-zinc-800 transition-colors text-base px-5 w-full shadow-none"

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch<{ invitation: InvitationInfo }>(
        `/staff/invitations/${token}`,
        { method: "GET" }
      )
      setInfo(data.invitation)
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "No se pudo abrir la invitación"
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || submitting) return
    if (name.trim().length === 0) {
      setError("Poné tu nombre")
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("El PIN son 4 a 6 números")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const data = await apiFetch<AcceptResponse>(
        `/staff/invitations/${token}/accept`,
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), pin }),
        }
      )
      setAuth(data.token, data.staff)
      const home =
        data.staff.role === "BARTENDER"
          ? "/pos"
          : data.staff.role === "SECURITY"
            ? "/scanner"
            : "/"
      navigate(home, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo entrar")
    } finally {
      setSubmitting(false)
    }
  }

  const unavailable =
    info != null && (info.status !== "PENDING" || info.expired)

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Cargando…</p>
        ) : loadError ? (
          <p
            className="rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {loadError}
          </p>
        ) : unavailable ? (
          <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-center text-sm text-muted-foreground dark:bg-zinc-900">
            {info?.expired
              ? "Esta invitación venció."
              : "Esta invitación ya no está disponible."}
          </p>
        ) : info ? (
          <>
            <div className="mb-8 text-center">
              <p className="text-sm text-muted-foreground">
                {info.tenantName ? info.tenantName : "Sumate al equipo"}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                Entrás como {staffRoleLabel(info.role)}
              </p>
            </div>

            {error ? (
              <p
                className="mb-4 rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                placeholder="Tu nombre"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
              />
              <Input
                placeholder="PIN (4 a 6 números)"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className={cn(inputClass, "tracking-[0.3em]")}
              />
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full h-12 mt-3 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Entrando…" : "Entrar"}
              </Button>
            </form>
            <p className="mt-6 text-center text-[13px] text-muted-foreground">
              Vas a usar este PIN para identificarte en el POS.
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
