import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type EventPerformanceRow = {
  eventId: string
  name: string
  date: string
  status: "active" | "draft" | "finished"
  ticketRevenue: string
  productRevenue: string
  totalRevenue: string
  ticketsSold: number
  ticketsCapacity: number | null
  salesProgress: number
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <Badge className="border-0 bg-primary/20 text-primary hover:bg-primary/20">
          Activo
        </Badge>
      )
    case "draft":
      return (
        <Badge variant="secondary" className="border-0">
          Borrador
        </Badge>
      )
    case "finished":
      return (
        <Badge
          variant="outline"
          className="border-muted-foreground/50 text-muted-foreground"
        >
          Finalizado
        </Badge>
      )
    default:
      return null
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatMoney(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

export function EventsTable({ rows }: { rows: EventPerformanceRow[] | null }) {
  const events = rows ?? []

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Rendimiento por evento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay eventos registrados
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Evento</TableHead>
                <TableHead className="text-muted-foreground">Fecha</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  Ingresos
                </TableHead>
                <TableHead className="text-muted-foreground">Entradas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={event.eventId}
                  className="border-border transition-colors hover:bg-secondary/50"
                >
                  <TableCell className="max-w-[180px] truncate font-medium">
                    {event.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(event.date)}
                  </TableCell>
                  <TableCell>{getStatusBadge(event.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMoney(event.totalRevenue)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={event.salesProgress}
                        className="h-2 w-20 bg-secondary [&>div]:bg-primary"
                      />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {event.ticketsSold}
                        {event.ticketsCapacity != null
                          ? `/${event.ticketsCapacity}`
                          : ""}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
