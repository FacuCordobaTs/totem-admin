import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { SalesChart } from "@/components/dashboard/sales-chart"
import { EventsTable } from "@/components/dashboard/events-table"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"

export function DashboardPage() {
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"
  const hasTenant = tenantId != null && tenantId !== ""

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          {!hasTenant ? (
            <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center py-8">
              {isAdmin ? <ProductoraSetupCard /> : <ProductoraWaitingCard />}
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Panel</h1>
                <p className="text-sm text-muted-foreground">
                  Resumen de la operación de tus eventos
                </p>
              </div>
              <div className="flex flex-col gap-6">
                <KpiCards />
                <div className="grid gap-6 lg:grid-cols-2">
                  <SalesChart />
                  <EventsTable />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
