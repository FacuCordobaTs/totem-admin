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

const events = [
  {
    id: "1",
    name: "Festival Noches Neón",
    date: "15 abr 2026",
    status: "active",
    salesProgress: 70,
    ticketsSold: 847,
    totalTickets: 1200,
  },
  {
    id: "2",
    name: "Gala corporativa 2026",
    date: "22 abr 2026",
    status: "draft",
    salesProgress: 35,
    ticketsSold: 175,
    totalTickets: 500,
  },
  {
    id: "3",
    name: "Fiesta en azotea",
    date: "1 may 2026",
    status: "active",
    salesProgress: 85,
    ticketsSold: 425,
    totalTickets: 500,
  },
  {
    id: "4",
    name: "Noche tech & networking",
    date: "10 may 2026",
    status: "draft",
    salesProgress: 12,
    ticketsSold: 36,
    totalTickets: 300,
  },
  {
    id: "5",
    name: "Noche de jazz y vino",
    date: "8 abr 2026",
    status: "finished",
    salesProgress: 100,
    ticketsSold: 200,
    totalTickets: 200,
  },
]

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
        <Badge variant="outline" className="border-muted-foreground/50 text-muted-foreground">
          Finalizado
        </Badge>
      )
    default:
      return null
  }
}

export function EventsTable() {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-medium">Próximos eventos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Evento</TableHead>
              <TableHead className="text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground">Avance de ventas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow
                key={event.id}
                className="border-border cursor-pointer transition-colors hover:bg-secondary/50"
              >
                <TableCell className="font-medium">{event.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {event.date}
                </TableCell>
                <TableCell>{getStatusBadge(event.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={event.salesProgress}
                      className="h-2 w-24 bg-secondary [&>div]:bg-primary"
                    />
                    <span className="text-sm text-muted-foreground">
                      {event.ticketsSold}/{event.totalTickets}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
