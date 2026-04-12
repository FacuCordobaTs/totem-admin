import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { TicketQrDialog } from "@/components/events/ticket-qr-dialog"
import { Search } from "lucide-react"

export type ApiTicketRow = {
  id: string
  qrHash: string
  status: "PENDING" | "USED" | "CANCELLED"
  buyerName: string | null
  buyerEmail: string | null
  createdAt: string | null
  ticketTypeId: string
  ticketTypeName: string
}

type TicketsResponse = { tickets: ApiTicketRow[] }

function statusBadge(status: ApiTicketRow["status"]) {
  switch (status) {
    case "PENDING":
      return (
        <Badge className="border-0 bg-primary/20 text-primary hover:bg-primary/20">
          Emitida
        </Badge>
      )
    case "USED":
      return (
        <Badge variant="outline" className="border-muted-foreground/50 text-muted-foreground">
          Usado
        </Badge>
      )
    case "CANCELLED":
      return (
        <Badge className="border-0 bg-destructive/20 text-destructive hover:bg-destructive/20">
          Cancelado
        </Badge>
      )
    default:
      return null
  }
}

type AttendeeTableProps = {
  eventId: string
  refreshTrigger: number
}

export function AttendeeTable({ eventId, refreshTrigger }: AttendeeTableProps) {
  const token = useAuthStore((s) => s.token)

  const [rows, setRows] = useState<ApiTicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [ticketFilter, setTicketFilter] = useState<string>("all")

  const [qrTicketId, setQrTicketId] = useState<string | null>(null)
  const [qrBuyerName, setQrBuyerName] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<TicketsResponse>(`/events/${eventId}/tickets`, {
        method: "GET",
        token,
      })
      setRows(data.tickets)
    } catch (err) {
      setRows([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las entradas")
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  const ticketTypeOptions = useMemo(() => {
    const names = new Set<string>()
    rows.forEach((r) => names.add(r.ticketTypeName))
    return Array.from(names).sort()
  }, [rows])

  const filtered = rows.filter((attendee) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      (attendee.buyerName?.toLowerCase().includes(q) ?? false) ||
      (attendee.buyerEmail?.toLowerCase().includes(q) ?? false) ||
      attendee.qrHash.toLowerCase().includes(q)

    const matchesStatus =
      statusFilter === "all" || attendee.status === statusFilter

    const matchesTicket =
      ticketFilter === "all" || attendee.ticketTypeName === ticketFilter

    return matchesSearch && matchesStatus && matchesTicket
  })

  function exportCsv() {
    const header = ["Nombre", "Correo", "Tipo", "Hash QR", "Estado"]
    const lines = filtered.map((r) =>
      [
        r.buyerName ?? "",
        r.buyerEmail ?? "",
        r.ticketTypeName,
        r.qrHash,
        r.status,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    const csv = [header.join(","), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `entradas-${eventId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-medium">Entradas vendidas</CardTitle>
          <Button variant="outline" size="sm" type="button" onClick={exportCsv}>
            Exportar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        ) : null}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, correo o código QR…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-secondary pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-secondary">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="PENDING">Emitida</SelectItem>
                <SelectItem value="USED">Usado</SelectItem>
                <SelectItem value="CANCELLED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ticketFilter} onValueChange={setTicketFilter}>
              <SelectTrigger className="w-[200px] bg-secondary">
                <SelectValue placeholder="Tipo de entrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ticketTypeOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-muted-foreground">Correo</TableHead>
                <TableHead className="text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-muted-foreground">Hash QR</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="w-[100px] text-right text-muted-foreground">
                  QR
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No hay entradas que coincidan.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((attendee) => (
                  <TableRow
                    key={attendee.id}
                    className="border-border transition-colors hover:bg-secondary/50"
                  >
                    <TableCell className="font-medium">
                      {attendee.buyerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {attendee.buyerEmail ?? "—"}
                    </TableCell>
                    <TableCell>{attendee.ticketTypeName}</TableCell>
                    <TableCell>
                      <code className="max-w-[140px] truncate rounded bg-secondary px-2 py-1 font-mono text-xs">
                        {attendee.qrHash}
                      </code>
                    </TableCell>
                    <TableCell>{statusBadge(attendee.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="font-medium"
                        onClick={() => {
                          setQrTicketId(attendee.id)
                          setQrBuyerName(attendee.buyerName)
                          setQrOpen(true)
                        }}
                      >
                        Ver QR
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <TicketQrDialog
          open={qrOpen}
          onOpenChange={(o) => {
            setQrOpen(o)
            if (!o) {
              setQrTicketId(null)
              setQrBuyerName(null)
            }
          }}
          ticketId={qrTicketId}
          buyerName={qrBuyerName}
          token={token}
        />

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {filtered.length} de {rows.length} entradas
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
