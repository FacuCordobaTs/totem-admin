import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { KpiCards, type DashboardKpiData } from "@/components/dashboard/kpi-cards"
import { SalesChart, type SalesHourPoint } from "@/components/dashboard/sales-chart"
import {
  EventsTable,
  type EventPerformanceRow,
} from "@/components/dashboard/events-table"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { apiFetch, ApiError } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Package } from "lucide-react"
import type { InventoryUnit } from "@/components/inventory/raw-materials"

type StockAlertItem = {
  id: string
  name: string
  unit: InventoryUnit
  currentStock: string
  threshold: string
}

type AnalyticsResponse = {
  kpis: DashboardKpiData
  focusEvent: { id: string; name: string; date: string } | null
  salesByHour: SalesHourPoint[]
  salesChartSparkline: number[]
  stockAlerts: StockAlertItem[]
  eventPerformance: EventPerformanceRow[]
}

function unitLabel(unit: InventoryUnit): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMOS":
      return "g"
    default:
      return "uds."
  }
}

export function DashboardPage() {
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const role = useAuthStore((s) => s.staff?.role)
  const token = useAuthStore((s) => s.token)
  const isAdmin = role === "ADMIN"
  const hasTenant = tenantId != null && tenantId !== ""

  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !hasTenant) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<AnalyticsResponse>("/analytics/dashboard", {
        method: "GET",
        token,
      })
      setData(res)
    } catch (err) {
      setData(null)
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el panel")
    } finally {
      setLoading(false)
    }
  }, [token, hasTenant])

  useEffect(() => {
    void load()
  }, [load])

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
                  KPIs en tiempo casi real según ventas y entradas registradas
                </p>
                {error ? (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                {loading && !data ? (
                  <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-6">
                <KpiCards
                  data={data?.kpis ?? null}
                  salesSparkline={data?.salesChartSparkline}
                />

                {data && data.stockAlerts.length > 0 ? (
                  <Card className="border-amber-500/40 bg-amber-500/5">
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <CardTitle className="text-base font-semibold text-amber-700 dark:text-amber-400">
                        Stock bajo ({data.stockAlerts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {data.stockAlerts.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-background/80 px-3 py-2"
                          >
                            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{a.name}</p>
                              <p className="text-xs text-muted-foreground">
                                <span className="font-mono text-destructive">
                                  {a.currentStock}
                                </span>{" "}
                                {unitLabel(a.unit)} · umbral{" "}
                                <span className="font-mono">{a.threshold}</span>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-2">
                  <SalesChart
                    data={data?.salesByHour ?? null}
                    focusEventName={data?.focusEvent?.name}
                  />
                  <EventsTable rows={data?.eventPerformance ?? null} />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
