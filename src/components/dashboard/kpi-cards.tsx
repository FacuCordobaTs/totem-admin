import type { ElementType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Ticket, Users, AlertTriangle } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: number
  icon: ElementType
  sparklineData?: number[]
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data)
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
  trend,
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
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">{value}</div>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend !== undefined && (
              <p
                className={`text-xs ${
                  trend >= 0 ? "text-primary" : "text-destructive"
                }`}
              >
                {trend >= 0 ? "+" : ""}
                {trend}% respecto a la hora anterior
              </p>
            )}
          </div>
          {sparklineData && <Sparkline data={sparklineData} />}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards() {
  const kpis = [
    {
      title: "Ventas totales hoy",
      value: "$24.580",
      trend: 12.5,
      icon: DollarSign,
      sparklineData: [12, 15, 18, 14, 22, 25, 28, 24, 30, 32, 28, 35],
    },
    {
      title: "Entradas vendidas",
      value: "847 / 1.200",
      subtitle: "70,6% de aforo",
      trend: 8.2,
      icon: Ticket,
      sparklineData: [50, 80, 120, 180, 250, 320, 400, 480, 560, 650, 750, 847],
    },
    {
      title: "Asistencia en vivo",
      value: "623",
      subtitle: "73,5% registrados",
      trend: 4.1,
      icon: Users,
      sparklineData: [0, 45, 120, 200, 280, 350, 410, 480, 520, 570, 600, 623],
    },
    {
      title: "Alertas de stock activas",
      value: "3",
      subtitle: "Ítems con stock bajo",
      icon: AlertTriangle,
      sparklineData: [1, 1, 2, 2, 2, 3, 3, 2, 3, 4, 3, 3],
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
