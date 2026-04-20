import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { MpConnectionCard } from "@/components/settings/mp-connection-card"

const SETTINGS_TABS = ["profile", "finances", "productora"] as const
type SettingsTab = (typeof SETTINGS_TABS)[number]

function isSettingsTab(v: string): v is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(v)
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-background p-6 sm:p-8">{children}</div>
  )
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mpToastHandled = useRef(false)
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const tenantName = useAuthStore((s) => s.staff?.tenantName)
  const staff = useAuthStore((s) => s.staff)
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"
  const isBartender = role === "BARTENDER"
  const isSecurity = role === "SECURITY"
  const restrictedSettingsTabs = isBartender || isSecurity
  const hasTenant = tenantId != null && tenantId !== ""

  const tabFromUrl = searchParams.get("tab") ?? "profile"
  const activeTab = useMemo((): SettingsTab => {
    if (restrictedSettingsTabs) return "profile"
    if (isSettingsTab(tabFromUrl)) return tabFromUrl
    return "profile"
  }, [restrictedSettingsTabs, tabFromUrl])

  function setTab(value: string) {
    if (!isSettingsTab(value)) return
    setSearchParams({ tab: value }, { replace: true })
  }

  useEffect(() => {
    if (restrictedSettingsTabs && tabFromUrl !== "profile") {
      setSearchParams({ tab: "profile" }, { replace: true })
    }
  }, [restrictedSettingsTabs, tabFromUrl, setSearchParams])

  useEffect(() => {
    const mpStatus = searchParams.get("mp_status")
    if (mpStatus !== "success" && mpStatus !== "error") {
      mpToastHandled.current = false
      return
    }
    if (mpToastHandled.current) return
    mpToastHandled.current = true
    if (mpStatus === "success") {
      toast.success("Mercado Pago conectado correctamente")
    } else {
      toast.error("No se pudo conectar Mercado Pago")
    }
    const next = new URLSearchParams(searchParams)
    next.delete("mp_status")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const profileSection = (
    <Panel>
      <h2 className="text-xl font-bold tracking-tight text-foreground">Cuenta</h2>
      <div className="mt-8 space-y-6">
        <div>
          <p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            Nombre
          </p>
          <p className="mt-1 text-[17px] text-foreground">{staff?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            Correo
          </p>
          <p className="mt-1 text-[17px] text-foreground">{staff?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
            Rol
          </p>
          <p className="mt-1 text-[17px] text-foreground">
            {staff ? staffRoleLabel(staff.role) : "—"}
          </p>
        </div>
      </div>
    </Panel>
  )

  const financesSection = (
    <div className="space-y-8">
      {hasTenant ? (
        <MpConnectionCard tenantId={tenantId ?? null} token={token} />
      ) : null}
      <Panel>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Finanzas</h2>
        {!hasTenant ? (
          <p className="mt-4 text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
            Configurá tu productora para vincular cobros.
          </p>
        ) : (
          <p className="mt-4 text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
            Reportes y métricas: en preparación.
          </p>
        )}
      </Panel>
    </div>
  )

  const productoraSection = (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Productora</h2>
        <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
          Una organización por administrador.
        </p>
      </div>

      {hasTenant ? (
        <Panel>
          <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">Activa</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
            {tenantName?.trim() || "Configurada"}
          </p>
        </Panel>
      ) : isAdmin ? (
        <ProductoraSetupCard className="w-full max-w-none rounded-2xl border-zinc-200/50 bg-background shadow-none dark:border-zinc-800/50" />
      ) : (
        <ProductoraWaitingCard className="w-full max-w-none rounded-2xl shadow-none" />
      )}
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-2xl space-y-10">
            <header className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {restrictedSettingsTabs ? "Mi perfil" : "Ajustes"}
              </h1>
              {!restrictedSettingsTabs ? (
                <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                  Cuenta y organización.
                </p>
              ) : null}
            </header>

            {restrictedSettingsTabs ? (
              profileSection
            ) : (
              <Tabs value={activeTab} onValueChange={setTab} className="w-full gap-8">
                <TabsList
                  variant="line"
                  className="h-auto w-full min-w-0 justify-start gap-6 border-b border-zinc-200/50 bg-transparent p-0 dark:border-zinc-800/50"
                >
                  <TabsTrigger
                    value="profile"
                    className="rounded-none border-0 border-b-2 border-transparent px-0 pb-3 text-[15px] font-medium text-[#8E8E93] data-[state=active]:border-[#FF9500] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-[#98989D]"
                  >
                    Perfil
                  </TabsTrigger>
                  <TabsTrigger
                    value="finances"
                    className="rounded-none border-0 border-b-2 border-transparent px-0 pb-3 text-[15px] font-medium text-[#8E8E93] data-[state=active]:border-[#FF9500] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-[#98989D]"
                  >
                    Finanzas
                  </TabsTrigger>
                  <TabsTrigger
                    value="productora"
                    className="rounded-none border-0 border-b-2 border-transparent px-0 pb-3 text-[15px] font-medium text-[#8E8E93] data-[state=active]:border-[#FF9500] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-[#98989D]"
                  >
                    Productora
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="mt-8">
                  {profileSection}
                </TabsContent>
                <TabsContent value="finances" className="mt-8">
                  {financesSection}
                </TabsContent>
                <TabsContent value="productora" className="mt-8">
                  {productoraSection}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
