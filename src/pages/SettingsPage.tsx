import { useEffect, useRef, useState } from "react"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Header } from "@/components/dashboard/header"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { ApiError, apiFetch } from "@/lib/api"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { CucuruConnectionCard } from "@/components/settings/cucuru-connection-card"
import { MpConnectionCard } from "@/components/settings/mp-connection-card"
import { WhatsAppConnectionCard } from "@/components/settings/whatsapp-connection-card"

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl bg-background p-6 sm:p-8">{children}</section>
}

export function SettingsPage() {
  const mpToastHandled = useRef(false)
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const tenantName = useAuthStore((s) => s.staff?.tenantName)
  const staff = useAuthStore((s) => s.staff)
  const token = useAuthStore((s) => s.token)
  const updateStaff = useAuthStore((s) => s.updateStaff)
  const logoutStore = useAuthStore((s) => s.logout)
  const [productoraName, setProductoraName] = useState(tenantName ?? "")
  const [savingProductora, setSavingProductora] = useState(false)
  const role = staff?.role
  const isAdmin = role === "ADMIN"
  const restrictedSettings = role === "BARTENDER" || role === "SECURITY"
  const hasTenant = tenantId != null && tenantId !== ""

  useEffect(() => {
    setProductoraName(tenantName ?? "")
  }, [tenantName])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mpStatus = params.get("mp_status")
    if (mpStatus !== "success" && mpStatus !== "error") {
      mpToastHandled.current = false
      return
    }
    if (mpToastHandled.current) return
    mpToastHandled.current = true
    if (mpStatus === "success") toast.success("Mercado Pago conectado correctamente")
    else toast.error("No se pudo conectar Mercado Pago")
    params.delete("mp_status")
    params.delete("mp_error")
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`)
  }, [])

  async function handleLogout() {
    try {
      await apiFetch("/staff/logout", { method: "POST", token })
    } catch {
      /* ignorar error de red */
    }
    logoutStore()
    window.location.assign("/login")
  }

  async function saveProductoraName(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !staff || !hasTenant) return
    const name = productoraName.trim()
    if (!name) {
      toast.error("Ingresá el nombre de la productora")
      return
    }
    setSavingProductora(true)
    try {
      const data = await apiFetch<{ tenant: { name: string } }>("/tenants/me", {
        method: "PUT",
        token,
        body: JSON.stringify({ name }),
      })
      updateStaff({ ...staff, tenantName: data.tenant.name })
      toast.success("Nombre de la productora actualizado")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo guardar el nombre")
    } finally {
      setSavingProductora(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F2F7] dark:bg-black">
      <Header />
      <main className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {restrictedSettings ? "Mi perfil" : "Cuenta"}
            </h1>
            {!restrictedSettings ? (
              <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                Administrá los datos y las integraciones de tu productora.
              </p>
            ) : null}
          </header>

          <Panel>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Perfil</h2>
            <div className="mt-8 space-y-6">
              <div><p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">Nombre</p><p className="mt-1 text-[17px] text-foreground">{staff?.name ?? "—"}</p></div>
              <div><p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">Correo</p><p className="mt-1 text-[17px] text-foreground">{staff?.email ?? "—"}</p></div>
              <div><p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">Rol</p><p className="mt-1 text-[17px] text-foreground">{staff ? staffRoleLabel(staff.role) : "—"}</p></div>
            </div>
          </Panel>

          {!restrictedSettings ? (
            <>
              <Panel>
                <h2 className="text-xl font-bold tracking-tight text-foreground">Productora</h2>
                {hasTenant ? (
                  <form onSubmit={saveProductoraName} className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Input value={productoraName} onChange={(e) => setProductoraName(e.target.value)} required maxLength={255} autoComplete="organization" className="h-11 rounded-xl" aria-label="Nombre de la productora" />
                    <Button type="submit" disabled={savingProductora || !isAdmin} className="h-11 rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90 disabled:opacity-50">{savingProductora ? "Guardando…" : "Guardar"}</Button>
                  </form>
                ) : isAdmin ? <div className="mt-6"><ProductoraSetupCard className="max-w-none" /></div> : <div className="mt-6"><ProductoraWaitingCard className="max-w-none" /></div>}
              </Panel>

              <section className="space-y-4">
                <div><h2 className="text-xl font-bold tracking-tight text-foreground">Pagos</h2><p className="mt-1 text-sm text-[#8E8E93] dark:text-[#98989D]">Conectá las plataformas para cobrar entradas y consumiciones.</p></div>
                {hasTenant ? <><MpConnectionCard tenantId={tenantId} token={token} /><CucuruConnectionCard tenantId={tenantId} token={token} /></> : null}
              </section>

              <section className="space-y-4">
                <div><h2 className="text-xl font-bold tracking-tight text-foreground">WhatsApp</h2><p className="mt-1 text-sm text-[#8E8E93] dark:text-[#98989D]">Configurá los mensajes para tus clientes y tu equipo.</p></div>
                {hasTenant ? <WhatsAppConnectionCard tenantId={tenantId} token={token} /> : null}
              </section>
            </>
          ) : null}

          <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30" onClick={() => void handleLogout()}><LogOut className="h-4 w-4" />Cerrar sesión</Button>
        </div>
      </main>
    </div>
  )
}
