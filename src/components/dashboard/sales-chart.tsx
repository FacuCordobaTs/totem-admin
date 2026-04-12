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

const data = [
  { time: "18:00", income: 1200, expenses: 450 },
  { time: "19:00", income: 2400, expenses: 680 },
  { time: "20:00", income: 4200, expenses: 890 },
  { time: "21:00", income: 6800, expenses: 1100 },
  { time: "22:00", income: 8500, expenses: 1350 },
  { time: "23:00", income: 9200, expenses: 1420 },
  { time: "00:00", income: 7800, expenses: 1200 },
  { time: "01:00", income: 5400, expenses: 980 },
  { time: "02:00", income: 3200, expenses: 650 },
  { time: "03:00", income: 1800, expenses: 420 },
]

export function SalesChart() {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Ingresos vs. gastos (últimas 24 h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="oklch(0.696 0.17 162.48)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor="oklch(0.696 0.17 162.48)"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="oklch(0.6 0 0)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="100%"
                    stopColor="oklch(0.6 0 0)"
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
                dataKey="time"
                stroke="oklch(0.6 0 0)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="oklch(0.6 0 0)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.12 0 0)",
                  border: "1px solid oklch(0.22 0 0)",
                  borderRadius: "8px",
                  color: "oklch(0.95 0 0)",
                }}
                labelStyle={{ color: "oklch(0.6 0 0)" }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="oklch(0.696 0.17 162.48)"
                strokeWidth={2}
                fill="url(#incomeGradient)"
                name="Ingresos"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="oklch(0.6 0 0)"
                strokeWidth={2}
                fill="url(#expensesGradient)"
                name="Gastos"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">Ingresos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">Gastos</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
