import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"

type AccessResponse = {
  message: string
  token: string
  staff: StaffProfile
}

type TenantSelectionResponse = {
  requiresTenantSelection: true
  options: { staffId: string; tenantName: string }[]
}

function homeForRole(role: StaffProfile["role"]): string {
  if (role === "BARTENDER") return "/pos"
  if (role === "SECURITY") return "/scanner"
  if (role === "PROMOTER") return "/promotor"
  return "/"
}

export function AccessPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tenantOptions, setTenantOptions] =
    useState<TenantSelectionResponse["options"] | null>(null)

  const consume = useCallback(
    async (staffId?: string) => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const data = await apiFetch<AccessResponse | TenantSelectionResponse>(
          "/staff/magic-link/consume",
          {
            method: "POST",
            body: JSON.stringify({ token, ...(staffId ? { staffId } : {}) }),
          }
        )
        if ("requiresTenantSelection" in data && data.requiresTenantSelection) {
          setTenantOptions(data.options)
          return
        }
        if (!("token" in data)) return
        setAuth(data.token, data.staff)
        navigate(homeForRole(data.staff.role), { replace: true })
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "El enlace es inválido o venció"
        )
      } finally {
        setLoading(false)
      }
    },
    [token, navigate, setAuth]
  )

  useEffect(() => {
    void consume()
    // Solo al montar: consumir con staffId es una acción explícita del selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {error ? (
          <div className="space-y-4">
            <p
              className="rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full h-12 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98]"
            >
              Volver al inicio
            </Button>
          </div>
        ) : tenantOptions && tenantOptions.length > 1 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground px-1">
              Seleccioná la Productora
            </p>
            {tenantOptions.map((opt) => (
              <button
                key={opt.staffId}
                type="button"
                disabled={loading}
                onClick={() => void consume(opt.staffId)}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-all disabled:opacity-60"
              >
                {opt.tenantName}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Entrando…</p>
        )}
      </div>
    </div>
  )
}
