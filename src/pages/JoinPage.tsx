import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"

type AcceptResponse = {
  message: string
  token: string
  staff: StaffProfile
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)
  const acceptedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token || acceptedTokenRef.current === token) return
    acceptedTokenRef.current = token
    void (async () => {
      try {
        const data = await apiFetch<AcceptResponse>(`/staff/invitations/${token}/accept`, {
          method: "POST",
          body: JSON.stringify({}),
        })
        setAuth(data.token, data.staff)
        const home =
          data.staff.role === "BARTENDER"
            ? "/pos"
            : data.staff.role === "SECURITY"
              ? "/scanner"
              : data.staff.role === "PROMOTER"
                ? "/promotor"
              : "/"
        navigate(home, { replace: true })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión")
      }
    })()
  }, [navigate, setAuth, token])

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {error ? <p className="rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p> : <p className="text-center text-sm text-muted-foreground">Abriendo tu acceso…</p>}
      </div>
    </div>
  )
}
