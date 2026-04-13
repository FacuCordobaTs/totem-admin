import type { ElementType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Ticket, ScanLine, AlertTriangle } from "lucide-react"

export type DashboardKpiData = {
  totalRevenue: string
  totalTicketsSold: number
  usedTickets: number
  stockAlertsCount: number
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  icon: ElementType
  sparklineData?: number[]
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const width = 80
  const height = 24
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg width={width} height={height} className="text-primary">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  sparklineData,
}: KpiCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-2xl font-bold">{value}</div>
            {subtitle ? (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {sparklineData ? <Sparkline data={sparklineData} /> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(n)
}

export function KpiCards({
  data,
  salesSparkline,
}: {
  data: DashboardKpiData | null
  salesSparkline?: number[]
}) {
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 animate-pulse rounded bg-secondary" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const kpis: KpiCardProps[] = [
    {
      title: "Ingresos totales",
      value: formatMoneyArs(data.totalRevenue),
      subtitle: "Entradas + bar (histórico)",
      icon: DollarSign,
      sparklineData: salesSparkline,
    },
    {
      title: "Entradas vendidas",
      value: String(data.totalTicketsSold),
      subtitle: "Emitidas (no canceladas)",
      icon: Ticket,
    },
    {
      title: "Entradas usadas",
      value: String(data.usedTickets),
      subtitle: "Validadas en puerta",
      icon: ScanLine,
    },
    {
      title: "Alertas de stock",
      value: String(data.stockAlertsCount),
      subtitle: "Por debajo del umbral",
      icon: AlertTriangle,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.title} {...kpi} />
      ))}
    </div>
  )
}
