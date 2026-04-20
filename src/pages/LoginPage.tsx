import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import {
  AuthFormError,
  AuthPageShell,
} from "@/components/auth/auth-page-shell"

type LoginResponse = {
  message: string
  token: string
  staff: StaffProfile
}

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<LoginResponse>("/staff/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      setAuth(data.token, data.staff)
      const home =
        data.staff.role === "BARTENDER"
          ? "/pos"
          : data.staff.role === "SECURITY"
            ? "/scanner"
            : "/"
      navigate(home, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  const inputClassName =
    "h-10 rounded-xl border-zinc-200/50 bg-zinc-50/60 dark:border-zinc-800/50 dark:bg-zinc-900/35"

  return (
    <AuthPageShell>
      <Card className="w-full max-w-md rounded-2xl border border-zinc-200/50 bg-background shadow-sm dark:border-zinc-800/50">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Iniciar sesión
          </CardTitle>
          <CardDescription className="text-[#8E8E93] dark:text-[#98989D]">
            Accedé al panel con tu cuenta de administración.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            {error ? <AuthFormError message={error} /> : null}
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium">
                Correo
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                Contraseña
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputClassName}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="h-10 w-full rounded-xl mt-4 bg-[#FF9500] text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-center text-sm text-[#8E8E93] dark:text-[#98989D]">
              ¿Primera vez?{" "}
              <Link
                to="/register"
                className="font-medium text-[#FF9500] underline-offset-4 hover:underline"
              >
                Crear cuenta de administrador
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthPageShell>
  )
}
