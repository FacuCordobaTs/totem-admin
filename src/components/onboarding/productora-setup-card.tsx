import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"

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
      className={
        className ??
        "mx-auto w-full max-w-lg border-border bg-card shadow-lg ring-1 ring-primary/20"
      }
    >
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Bienvenido a Totem
        </CardTitle>
        <CardDescription className="text-base text-muted-foreground">
          Para comenzar a gestionar eventos, primero debes configurar tu productora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {error ? (
            <p
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
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
              placeholder="Ej. Lauta Eventos"
              className="h-11 border-border bg-secondary/80 text-base"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="h-12 w-full text-base font-semibold"
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
      className={
        className ??
        "mx-auto w-full max-w-lg border-border bg-card ring-1 ring-foreground/10"
      }
    >
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-xl font-semibold">Productora</CardTitle>
        <CardDescription className="text-base text-muted-foreground">
          Tu cuenta todavía no está vinculada a una productora. Pedile a un administrador que
          complete la configuración en Totem para poder trabajar con eventos.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
