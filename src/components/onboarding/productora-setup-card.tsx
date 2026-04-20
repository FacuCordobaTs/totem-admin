import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthFormError } from "@/components/auth/auth-page-shell"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

type SetupResponse = {
  staff: StaffProfile & { tenantName?: string | null }
  tenant: { id: string; name: string }
}

type ProductoraSetupCardProps = {
  /** Narrow layout for settings sidebar vs full onboarding */
  className?: string
  onSuccess?: () => void
}

export function ProductoraSetupCard({ className, onSuccess }: ProductoraSetupCardProps) {
  const token = useAuthStore((s) => s.token)
  const updateStaff = useAuthStore((s) => s.updateStaff)

  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<SetupResponse>("/tenants/setup", {
        method: "POST",
        token,
        body: JSON.stringify({ name: name.trim() }),
      })
      updateStaff({
        ...data.staff,
        tenantId: data.staff.tenantId ?? null,
        tenantName: data.staff.tenantName ?? data.tenant.name,
      })
      setName("")
      onSuccess?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg rounded-2xl border border-zinc-200/50 bg-background shadow-sm dark:border-zinc-800/50",
        className
      )}
    >
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Bienvenido a Totem
        </CardTitle>
        <CardDescription className="text-base text-[#8E8E93] dark:text-[#98989D]">
          Para comenzar a gestionar eventos, primero debes configurar tu productora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {error ? (
            <AuthFormError message={error} className="text-center" />
          ) : null}
          <div className="space-y-2">
            <label htmlFor="productora-name" className="text-sm font-medium text-foreground">
              Nombre de tu productora
            </label>
            <Input
              id="productora-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="organization"
              placeholder="Ej. Grupo Eventos"
              className="h-11 rounded-xl border-zinc-200/50 bg-zinc-50/60 text-base dark:border-zinc-800/50 dark:bg-zinc-900/35"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-60"
          >
            {loading ? "Guardando…" : "Configurar tu productora"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function ProductoraWaitingCard({ className }: { className?: string }) {
  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg rounded-2xl border border-zinc-200/50 bg-background shadow-sm dark:border-zinc-800/50",
        className
      )}
    >
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">Productora</CardTitle>
        <CardDescription className="text-base text-[#8E8E93] dark:text-[#98989D]">
          Tu cuenta todavía no está vinculada a una productora. Pedile a un administrador que
          complete la configuración en Totem para poder trabajar con eventos.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
