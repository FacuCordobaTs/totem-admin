import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type SalesHourPoint = {
  hour: number
  label: string
  revenue: number
}

export function SalesChart({
  data,
  focusEventName,
}: {
  data: SalesHourPoint[] | null
  focusEventName?: string | null
}) {
  const chartData = data ?? []

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Ventas del bar por hora
          {focusEventName ? (
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Evento: {focusEventName}
            </span>
          ) : (
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Sin evento foco — registrá ventas en el POS
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No hay ventas registradas para este evento
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(0.696 0.17 162.48)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.696 0.17 162.48)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.22 0 0)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="oklch(0.6 0 0)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  stroke="oklch(0.6 0 0)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("es-AR", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(Number(value))
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.12 0 0)",
                    border: "1px solid oklch(0.22 0 0)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0 0)",
                  }}
                  labelStyle={{ color: "oklch(0.6 0 0)" }}
                  formatter={(value) => {
                    const n = typeof value === "number" ? value : Number(value)
                    return [
                      new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 2,
                      }).format(Number.isNaN(n) ? 0 : n),
                      "Ventas",
                    ]
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="oklch(0.696 0.17 162.48)"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                  name="Ventas"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">
            Ingresos POS (suma de ventas)
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
