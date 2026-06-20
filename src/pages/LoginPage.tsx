import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

type LoginResponse = {
  message: string
  token: string
  staff: StaffProfile
}

type TenantSelectionResponse = {
  requiresTenantSelection: true
  options: { staffId: string; tenantName: string }[]
}

const inputClass =
  "h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-0 focus-visible:ring-0 focus-visible:bg-zinc-200/70 dark:focus-visible:bg-zinc-800 transition-colors text-base px-5 w-full shadow-none"

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tenantOptions, setTenantOptions] = useState<TenantSelectionResponse["options"] | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, string> = { email, password }
      if (selectedStaffId) body.staffId = selectedStaffId

      const data = await apiFetch<LoginResponse | TenantSelectionResponse>("/staff/login", {
        method: "POST",
        body: JSON.stringify(body),
      })

      if ("requiresTenantSelection" in data && data.requiresTenantSelection) {
        setTenantOptions(data.options)
        setSelectedStaffId(data.options[0]?.staffId ?? null)
        return
      }

      const loginData = data as LoginResponse
      setAuth(loginData.token, loginData.staff)
      const home =
        loginData.staff.role === "BARTENDER"
          ? "/pos"
          : loginData.staff.role === "SECURITY"
            ? "/scanner"
            : "/"
      navigate(home, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <div className="flex justify-center mb-12">
          <img src="/logo.png" alt="Crow" className="h-12 w-auto rounded-2xl" />
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
            id="login-email"
            type="email"
            placeholder="Correo electrónico"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setTenantOptions(null)
              setSelectedStaffId(null)
            }}
            required
            className={inputClass}
          />

          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setTenantOptions(null)
                setSelectedStaffId(null)
              }}
              required
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {tenantOptions && tenantOptions.length > 1 ? (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-sm font-medium text-muted-foreground px-1">Seleccioná la Productora</p>
              {tenantOptions.map((opt) => (
                <button
                  key={opt.staffId}
                  type="button"
                  onClick={() => setSelectedStaffId(opt.staffId)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-all ${
                    selectedStaffId === opt.staffId
                      ? "bg-[#FF9500]/10 font-semibold text-[#FF9500]"
                      : "bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      selectedStaffId === opt.staffId
                        ? "border-[#FF9500] bg-[#FF9500]"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  />
                  {opt.tenantName}
                </button>
              ))}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={loading || (tenantOptions !== null && !selectedStaffId)}
            className="w-full h-12 mt-3 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Entrando…" : tenantOptions ? "Continuar" : "Entrar"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-10">
          <Link
            to="/register"
            className="text-[#FF9500] hover:text-[#FF9500]/80 transition-colors font-medium"
          >
            Crear cuenta de administrador
          </Link>
        </div>
      </div>
    </div>
  )
}
