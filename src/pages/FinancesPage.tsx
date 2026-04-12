import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"

export function FinancesPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <h1 className="text-2xl font-semibold">Finanzas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pagos, conciliación con Mercado Pago e informes irán aquí.
          </p>
        </div>
      </main>
    </div>
  )
}
