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

type RegisterResponse = {
  message: string
  token: string
  staff: StaffProfile
}

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Las contraseñas no coinciden")
      return
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    setLoading(true)
    try {
      const data = await apiFetch<RegisterResponse>("/staff/register-admin", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      })
      setAuth(data.token, data.staff)
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar")
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
            Registrar administrador
          </CardTitle>
          <CardDescription className="text-[#8E8E93] dark:text-[#98989D]">
            Creá la cuenta principal con rol administrador para tu organización.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            {error ? <AuthFormError message={error} /> : null}
            <div className="space-y-2">
              <label htmlFor="reg-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="reg-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="reg-email" className="text-sm font-medium">
                Correo
              </label>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="reg-password" className="text-sm font-medium">
                Contraseña
              </label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="reg-confirm" className="text-sm font-medium">
                Confirmar contraseña
              </label>
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={inputClassName}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="h-10 w-full rounded-xl bg-[#FF9500] text-[14px] font-semibold mt-4 text-white hover:bg-[#FF9500]/90 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </Button>
            <p className="text-center text-sm text-[#8E8E93] dark:text-[#98989D]">
              ¿Ya tenés cuenta?{" "}
              <Link
                to="/login"
                className="font-medium text-[#FF9500] underline-offset-4 hover:underline"
              >
                Iniciar sesión
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthPageShell>
  )
}
