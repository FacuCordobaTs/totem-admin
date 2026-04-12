import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"

export function SettingsPage() {
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const tenantName = useAuthStore((s) => s.staff?.tenantName)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"
  const hasTenant = tenantId != null && tenantId !== ""

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-semibold">Ajustes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organización, facturación e integraciones se configurarán aquí.
          </p>

          <div className="mx-auto mt-10 max-w-lg space-y-8">
            <section className="space-y-3">
              <h2 className="text-lg font-medium tracking-tight">Productora</h2>
              <p className="text-sm text-muted-foreground">
                Una sola productora por administrador. El nombre se muestra en tu equipo y en
                operaciones internas.
              </p>

              {hasTenant ? (
                <Card className="border-border bg-card ring-1 ring-foreground/10">
                  <CardHeader>
                    <CardTitle className="text-base">Estado</CardTitle>
                    <CardDescription>
                      {tenantName ? (
                        <>
                          Tu productora:{" "}
                          <span className="font-medium text-foreground">{tenantName}</span>
                        </>
                      ) : (
                        "Productora configurada"
                      )}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : isAdmin ? (
                <ProductoraSetupCard className="w-full max-w-none border-border bg-card ring-1 ring-foreground/10 shadow-none" />
              ) : (
                <ProductoraWaitingCard className="w-full max-w-none shadow-none" />
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
