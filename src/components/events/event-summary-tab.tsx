import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventSummaryResponse } from "@/types/event-dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Ticket, Wine } from "lucide-react"

function formatMoneyArs(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl border border-border bg-muted/40"
        />
      ))}
    </div>
  )
}

type Props = {
  eventId: string
}

export function EventSummaryTab({ eventId }: Props) {
  const token = useAuthStore((s) => s.token)
  const [data, setData] = useState<EventSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<EventSummaryResponse>(
        `/events/${eventId}/summary`,
        { method: "GET", token }
      )
      setData(res)
    } catch (e) {
      setData(null)
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el resumen")
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <SummarySkeleton />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Métricas consolidadas de tu Productora para este evento.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/80 bg-card shadow-sm ring-1 ring-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingresos totales
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400/90" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoneyArs(data.grossRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entradas + ventas completadas (POS, app y web)
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card shadow-sm ring-1 ring-white/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Entradas vendidas
            </CardTitle>
            <Ticket className="h-4 w-4 text-sky-400/90" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {data.ticketsSold.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tickets emitidos (excluye cancelados)
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card shadow-sm ring-1 ring-white/5 sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bebidas / consumos digitales
            </CardTitle>
            <Wine className="h-4 w-4 text-violet-400/90" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {data.digitalConsumptionsSold.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tokens digitales emitidos para este evento
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
