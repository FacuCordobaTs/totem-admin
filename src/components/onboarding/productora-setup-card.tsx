import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

type SetupResponse = {
  staff: StaffProfile & { tenantName?: string | null }
  tenant: { id: string; name: string }
}

type ProductoraSetupCardProps = {
  className?: string
  onSuccess?: () => void
  variant?: "default" | "account"
}

export function ProductoraSetupCard({ className, onSuccess, variant = "default" }: ProductoraSetupCardProps) {
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
    <div className={cn(variant === "account" ? "account-setup" : "mx-auto w-full max-w-sm", className)}>
      {variant !== "account" ? <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Productora</h1>
        <p className="mt-3 text-[15px] text-white/40">
          Poné un nombre para comenzar a gestionar eventos.
        </p>
      </div> : <p className="account-setup-description">Poné un nombre para comenzar a gestionar eventos.</p>}
      <form onSubmit={onSubmit} className={variant === "account" ? "account-form" : "flex flex-col gap-4"}>
        {error ? (
          <p className="text-sm text-red-400 text-center" role="alert">{error}</p>
        ) : null}
        {variant === "account" ? <label htmlFor="productora-name">Nombre de la productora</label> : null}
        <Input
          id="productora-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="organization"
          placeholder="Nombre de tu productora"
          className={variant === "account" ? "account-setup-input" : "h-12 rounded-xl border-white/[0.08] bg-white/[0.04] text-base text-white placeholder:text-white/25 focus-visible:ring-[#FF9500]/50"}
        />
        <Button
          type="submit"
          disabled={loading}
          className={variant === "account" ? "account-button account-button-primary" : "h-12 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"}
        >
          {loading ? "Guardando…" : "Continuar"}
        </Button>
      </form>
    </div>
  )
}

export function ProductoraWaitingCard({ className, variant = "default" }: { className?: string; variant?: "default" | "account" }) {
  if (variant === "account") return <div className="account-empty"><h3>Sin productora</h3><p>Tu cuenta todavía no está vinculada a una productora. Pedile a un administrador que complete la configuración.</p></div>
  return (
    <div className={cn("mx-auto w-full max-w-sm text-center", className)}>
      <p className="text-[13px] font-semibold uppercase tracking-widest text-[#FF9500] mb-3">Crow</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-white">Sin productora</h1>
      <p className="mt-3 text-[15px] text-white/40">
        Tu cuenta todavía no está vinculada a una productora. Pedile a un administrador que complete la configuración.
      </p>
    </div>
  )
}
