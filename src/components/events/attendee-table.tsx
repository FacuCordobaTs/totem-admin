import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { TicketQrDialog } from "@/components/events/ticket-qr-dialog"
import type { ApiTicketType } from "@/components/events/ticket-types"
import { Ban, ChevronRight, Mail, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export type ApiTicketRow = {
  id: string
  qrHash: string
  status: "PENDING" | "USED" | "CANCELLED"
  buyerName: string | null
  buyerEmail: string | null
  createdAt: string | null
  scannedAt: string | null
  emailSentAt: string | null
  ticketTypeId: string
  ticketTypeName: string
}

type TicketsResponse = { tickets: ApiTicketRow[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

const filterTriggerClass =
  "h-10 min-w-[140px] rounded-xl border-white/[0.1] bg-white/[0.05] px-3 text-[14px] text-foreground shadow-none"

function emailSentBadge(emailSentAt: string | null) {
  if (emailSentAt != null && emailSentAt !== "") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Email Enviado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
      Email Pendiente
    </span>
  )
}

function statusPill(status: ApiTicketRow["status"]) {
  switch (status) {
    case "PENDING":
      return (
        <span className="text-[11px] font-normal lowercase text-white/40">
          emitida
        </span>
      )
    case "USED":
      return (
        <span className="text-[11px] font-normal lowercase text-white/20">
          usada
        </span>
      )
    case "CANCELLED":
      return (
        <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-500">
          Cancelada
        </span>
      )
    default:
      return null
  }
}

function formatShortDate(value: string | null): string {
  if (value == null) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

type AttendeeTableProps = {
  eventId: string
  refreshTrigger: number
  layout?: "default" | "canvas"
  hideExportButton?: boolean
}

export type AttendeeTableHandle = {
  exportCsv: () => void
}

export const AttendeeTable = forwardRef<AttendeeTableHandle, AttendeeTableProps>(
  function AttendeeTable(
    { eventId, refreshTrigger, layout = "default", hideExportButton = false },
    ref
  ) {
    const token = useAuthStore((s) => s.token)

    const [rows, setRows] = useState<ApiTicketRow[]>([])
    const [ticketTypes, setTicketTypes] = useState<ApiTicketType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<"all" | "PENDING" | "USED">("all")
    const [filterTicketTypeId, setFilterTicketTypeId] = useState<"all" | string>("all")

    const [detail, setDetail] = useState<ApiTicketRow | null>(null)
    const [qrTicketId, setQrTicketId] = useState<string | null>(null)
    const [qrBuyerName, setQrBuyerName] = useState<string | null>(null)
    const [qrOpen, setQrOpen] = useState(false)
    const [actionLoading, setActionLoading] = useState<"email" | "cancel" | null>(
      null
    )
    const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

    const loadTicketTypes = useCallback(async () => {
      if (!token || !eventId) return
      try {
        const data = await apiFetch<TicketTypesResponse>(
          `/events/${eventId}/ticket-types`,
          { method: "GET", token }
        )
        setTicketTypes(data.ticketTypes)
      } catch {
        setTicketTypes([])
      }
    }, [token, eventId])

    const loadTickets = useCallback(
      async (opts?: { silent?: boolean }) => {
        if (!token || !eventId) return
        if (!opts?.silent) {
          setError(null)
          setLoading(true)
        }
        try {
          const q = new URLSearchParams()
          q.set("orderBy", "createdAt")
          q.set("order", "desc")
          if (filterStatus !== "all") q.set("status", filterStatus)
          if (filterTicketTypeId !== "all")
            q.set("ticketTypeId", filterTicketTypeId)
          const data = await apiFetch<TicketsResponse>(
            `/events/${eventId}/tickets?${q.toString()}`,
            { method: "GET", token }
          )
          const next = data.tickets.map((t) => ({
            ...t,
            emailSentAt: t.emailSentAt ?? null,
          }))
          setRows(next.filter((t) => t.status !== "CANCELLED"))
          setDetail((d) => {
            if (d == null) return null
            const u = next.find((t) => t.id === d.id)
            if (u == null || u.status === "CANCELLED") return null
            return u
          })
        } catch (err) {
          if (!opts?.silent) {
            setRows([])
            setError(
              err instanceof ApiError
                ? err.message
                : "No se pudieron cargar las entradas"
            )
          } else {
            toast.error(
              err instanceof ApiError
                ? err.message
                : "No se pudo actualizar la lista de entradas"
            )
          }
        } finally {
          if (!opts?.silent) setLoading(false)
        }
      },
      [token, eventId, filterStatus, filterTicketTypeId, refreshTrigger]
    )

    useEffect(() => {
      void loadTicketTypes()
    }, [loadTicketTypes, refreshTrigger])

    useEffect(() => {
      void loadTickets()
    }, [loadTickets])

    const filtered = useMemo(() => {
      const q = searchQuery.toLowerCase().trim()
      if (q === "") return rows
      return rows.filter((t) => {
        return (
          (t.buyerName?.toLowerCase().includes(q) ?? false) ||
          (t.buyerEmail?.toLowerCase().includes(q) ?? false) ||
          t.qrHash.toLowerCase().includes(q)
        )
      })
    }, [rows, searchQuery])

    const exportCsv = useCallback(() => {
      const header = [
        "Nombre",
        "Correo",
        "Tipo",
        "Fecha compra",
        "Fecha uso",
        "Hash QR",
        "Estado",
      ]
      const lines = filtered.map((r) =>
        [
          r.buyerName ?? "",
          r.buyerEmail ?? "",
          r.ticketTypeName,
          r.createdAt ?? "",
          r.scannedAt ?? "",
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
    }, [filtered, eventId])

    useImperativeHandle(ref, () => ({ exportCsv }), [exportCsv])

    const isCanvas = layout === "canvas"

    const handleSendQrEmail = useCallback(async () => {
      if (!token || !detail) return
      setActionLoading("email")
      try {
        await apiFetch<{ message?: string }>(`/tickets/${detail.id}/send-email`, {
          method: "POST",
          token,
        })
        toast.success("Email con QR enviado")
        await loadTickets({ silent: true })
      } catch (e) {
        toast.error(
          e instanceof ApiError ? e.message : "No se pudo enviar el email"
        )
      } finally {
        setActionLoading(null)
      }
    }, [token, detail, loadTickets])

    const handleConfirmCancelTicket = useCallback(async () => {
      if (!token || !detail) return
      setActionLoading("cancel")
      try {
        await apiFetch<{ message?: string }>(`/tickets/${detail.id}/cancel`, {
          method: "POST",
          token,
        })
        setCancelConfirmOpen(false)
        toast.success("Entrada anulada")
        await loadTickets({ silent: true })
      } catch (e) {
        toast.error(
          e instanceof ApiError ? e.message : "No se pudo anular la entrada"
        )
      } finally {
        setActionLoading(null)
      }
    }, [token, detail, loadTickets])

    useEffect(() => {
      if (detail == null) setCancelConfirmOpen(false)
    }, [detail])

    return (
      <section className="w-full space-y-6">
        {!isCanvas ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Asistentes
            </h2>
            {!hideExportButton ? (
              <Button
                variant="ghost"
                type="button"
                onClick={exportCsv}
                disabled={loading || filtered.length === 0}
                className="h-9 rounded-xl px-3 text-[14px] font-medium text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
              >
                Exportar CSV
              </Button>
            ) : null}
          </div>
        ) : (
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Asistentes</h2>
        )}

        {/* Toolbar: búsqueda principal + filtros sutiles */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" />
            <Input
              placeholder="Buscar asistente"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 rounded-xl border-white/[0.1] bg-white/[0.05] pl-10 text-[15px] shadow-none placeholder:text-white/30 focus-visible:border-white/20 focus-visible:ring-0"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={filterTicketTypeId}
              onValueChange={(v) => setFilterTicketTypeId(v)}
            >
              <SelectTrigger className={filterTriggerClass}>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ticketTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
            >
              <SelectTrigger className={cn(filterTriggerClass, "min-w-[120px]")}>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PENDING">Emitidas</SelectItem>
                <SelectItem value="USED">Usadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <p className="text-[15px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        {/* Lista grouped-inset: sin bordes pesados, divisor con sangría */}
        <div className="overflow-hidden rounded-2xl ">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="w-12 pl-4 text-[11px] font-normal lowercase text-white/45">
                  Nº
                </TableHead>
                <TableHead className="pl-6 text-[11px] font-normal lowercase text-white/45">
                  Asistente
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Tipo
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Estado
                </TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-0 hover:bg-transparent">
                    <TableCell className="pl-6 py-4" colSpan={5}>
                      <div className="h-5 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ) : (
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {filtered.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="py-14 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]"
                    >
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t, index) => (
                    <TableRow
                      key={t.id}
                      onClick={() => setDetail(t)}
                      className="group cursor-pointer border-0 transition-colors duration-150 hover:bg-white/[0.03]"
                    >
                      <TableCell className="pl-4 py-3.5 font-mono text-[12px] tabular-nums text-zinc-400 dark:text-zinc-600">
                        {filtered.length - index}
                      </TableCell>
                      <TableCell className="pl-6 py-3.5 text-[15px] font-medium text-foreground">
                        {t.buyerName ?? "—"}
                      </TableCell>
                      <TableCell className="py-3.5 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                        {t.ticketTypeName}
                      </TableCell>
                      <TableCell className="py-3.5">{statusPill(t.status)}</TableCell>
                      <TableCell className="pr-4 py-3.5 text-right">
                        <ChevronRight className="inline h-4 w-4 text-[#C7C7CC] transition-transform duration-150 group-hover:translate-x-0.5 dark:text-[#48484A]" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </div>

        <p className="px-1 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
          {loading
            ? "Cargando…"
            : `${filtered.length} ${filtered.length === 1 ? "entrada" : "entradas"}`}
        </p>

        {/* Panel de detalle: todo lo secundario vive acá */}
        <Sheet
          open={detail !== null}
          onOpenChange={(open) => {
            if (!open) setDetail(null)
          }}
        >
          <SheetContent
            side="right"
            className="w-full gap-0 border-l border-white/[0.06] bg-[#0a0a0a] p-0 shadow-none ring-0 sm:max-w-md"
          >
            {detail ? (
              <>
                <SheetHeader className="border-white/[0.06]">
                  <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
                    {detail.buyerName ?? "Sin nombre"}
                  </SheetTitle>
                  <SheetDescription className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                    {detail.ticketTypeName}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                      Estado
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {statusPill(detail.status)}
                      {emailSentBadge(detail.emailSentAt ?? null)}
                    </div>
                  </div>

                  <DetailRow
                    label="Correo"
                    value={detail.buyerEmail ?? "—"}
                    mono={false}
                  />
                  <DetailRow
                    label="Fecha de compra"
                    value={formatShortDate(detail.createdAt)}
                    mono={false}
                  />
                  <DetailRow
                    label="Fecha de uso"
                    value={formatShortDate(detail.scannedAt)}
                    mono={false}
                  />
                </div>

                <div className="space-y-2 border-t border-white/[0.06] p-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setQrTicketId(detail.id)
                      setQrBuyerName(detail.buyerName)
                      setQrOpen(true)
                    }}
                    className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 active:opacity-70"
                  >
                    Ver QR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading !== null ||
                      detail.status === "CANCELLED" ||
                      (detail.buyerEmail?.trim() ?? "") === ""
                    }
                    onClick={() => {
                      void handleSendQrEmail()
                    }}
                    className="h-11 w-full gap-2 rounded-xl border-white/[0.15] bg-transparent text-[15px] font-semibold text-white/70 hover:border-white/25"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    {actionLoading === "email" ? "Enviando…" : "Enviar QR por Email"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      actionLoading !== null ||
                      detail.status === "USED" ||
                      detail.status === "CANCELLED"
                    }
                    onClick={() => setCancelConfirmOpen(true)}
                    className="h-11 w-full gap-2 rounded-xl text-[15px] font-semibold text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Ban className="h-4 w-4 shrink-0" />
                    {actionLoading === "cancel" ? "Anulando…" : "Anular Entrada"}
                  </Button>
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>

        <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
          <DialogContent className="rounded-2xl border border-white/[0.08] bg-[#111111]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-foreground">
                Anular entrada
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                ¿Estás seguro de que deseas anular esta entrada? Esta acción no se puede
                deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-white/[0.15] bg-transparent text-white/70 hover:border-white/25"
                disabled={actionLoading === "cancel"}
                onClick={() => setCancelConfirmOpen(false)}
              >
                Volver
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl font-semibold"
                disabled={actionLoading === "cancel"}
                onClick={() => void handleConfirmCancelTicket()}
              >
                {actionLoading === "cancel" ? "Anulando…" : "Anular entrada"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
      </section>
    )
  }
)

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-[15px] text-foreground",
          mono && "font-mono text-[13px]"
        )}
      >
        {value}
      </p>
    </div>
  )
}
