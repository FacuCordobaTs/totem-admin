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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { TicketQrDialog } from "@/components/events/ticket-qr-dialog"
import type { ApiTicketType } from "@/components/events/ticket-types"
import { Mail, Plus, Search } from "lucide-react"
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
  "h-9 min-w-[130px] rounded-xl border-white/[0.1] bg-white/[0.05] px-3 text-[13px] text-foreground shadow-none"

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
  onNewSale?: () => void
}

export type AttendeeTableHandle = {
  exportCsv: () => void
}

export const AttendeeTable = forwardRef<AttendeeTableHandle, AttendeeTableProps>(
  function AttendeeTable(
    { eventId, refreshTrigger, hideExportButton = false, onNewSale },
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
    const [actionLoading, setActionLoading] = useState<"email" | "cancel" | null>(null)
    const [cancelConfirming, setCancelConfirming] = useState(false)

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
        setCancelConfirming(false)
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
      if (detail == null) setCancelConfirming(false)
    }, [detail])

    return (
      <section className="w-full space-y-5">
        {/* Header: title + filters + new sale button all on one line */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-2xl font-bold tracking-tight text-foreground">
            Asistentes
          </h2>
          {!hideExportButton && (
            <Button
              variant="ghost"
              type="button"
              onClick={exportCsv}
              disabled={loading || filtered.length === 0}
              className="h-9 rounded-xl px-3 text-[13px] font-medium text-white/40 hover:text-foreground"
            >
              Exportar CSV
            </Button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <Input
              placeholder="Buscar asistente"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-44 rounded-xl border-white/[0.1] bg-white/[0.05] pl-8 text-[13px] shadow-none placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
            />
          </div>
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
            <SelectTrigger className={cn(filterTriggerClass, "min-w-[100px]")}>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDING">Emitidas</SelectItem>
              <SelectItem value="USED">Usadas</SelectItem>
            </SelectContent>
          </Select>
          {onNewSale ? (
            <Button
              type="button"
              onClick={onNewSale}
              className="h-9 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 active:opacity-80"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva venta</span>
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="text-[15px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="overflow-hidden rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="w-10 pl-4 text-[11px] font-normal lowercase text-white/45">
                  Nº
                </TableHead>
                <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                  Asistente
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Tipo
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Correo
                </TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-0 hover:bg-transparent">
                    <TableCell className="py-4 pl-4" colSpan={5}>
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
                      className="py-14 text-center text-[15px] text-white/40"
                    >
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t, index) => (
                    <TableRow
                      key={t.id}
                      onClick={() => { setCancelConfirming(false); setDetail(t) }}
                      className="cursor-pointer border-0 transition-colors duration-150 hover:bg-white/[0.03]"
                    >
                      <TableCell className="py-3.5 pl-4 font-mono text-[12px] tabular-nums text-zinc-600">
                        {filtered.length - index}
                      </TableCell>
                      <TableCell className="py-3.5 pl-4 text-[15px] font-medium text-foreground">
                        {t.buyerName ?? "—"}
                      </TableCell>
                      <TableCell className="py-3.5 text-[15px] text-white/50">
                        {t.ticketTypeName}
                      </TableCell>
                      <TableCell className="py-3.5">{statusPill(t.status)}</TableCell>
                      <TableCell className="py-3.5 pr-4 text-[13px] text-white/35">
                        {t.buyerEmail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </div>

        <p className="px-1 text-[13px] text-white/35">
          {loading
            ? "Cargando…"
            : `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`}
        </p>

        {/* Detail dialog */}
        <Dialog
          open={detail !== null}
          onOpenChange={(o) => {
            if (!o) {
              setDetail(null)
              setCancelConfirming(false)
            }
          }}
        >
          <DialogContent
            showCloseButton
            className="w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-[440px]"
          >
            {detail ? (
              <>
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <DialogHeader className="gap-1 text-left sm:text-left">
                    <DialogTitle className="text-[20px] font-bold tracking-tight text-foreground">
                      {detail.buyerName ?? "Sin nombre"}
                    </DialogTitle>
                    <p className="text-[14px] text-white/40">{detail.ticketTypeName}</p>
                  </DialogHeader>
                </div>

                {!cancelConfirming ? (
                  <>
                    <div className="space-y-5 px-6 py-5">
                      <div className="flex flex-wrap items-center gap-3">
                        {statusPill(detail.status)}
                        {detail.emailSentAt ? (
                          <span className="text-[11px] text-white/35">email enviado</span>
                        ) : (
                          <span className="text-[11px] text-white/25">email pendiente</span>
                        )}
                      </div>

                      <DetailRow label="correo">
                        {detail.buyerEmail ? (
                          <a
                            href={`mailto:${detail.buyerEmail}`}
                            className="break-words text-[15px] text-foreground underline-offset-2 hover:underline"
                          >
                            {detail.buyerEmail}
                          </a>
                        ) : (
                          <span className="text-[15px] text-foreground">—</span>
                        )}
                      </DetailRow>

                      <DetailRow label="fecha de compra">
                        <span className="text-[15px] text-foreground">
                          {formatShortDate(detail.createdAt)}
                        </span>
                      </DetailRow>

                      <DetailRow label="fecha de uso">
                        <span className="text-[15px] text-foreground">
                          {formatShortDate(detail.scannedAt)}
                        </span>
                      </DetailRow>
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
                        onClick={() => void handleSendQrEmail()}
                        className="h-11 w-full gap-2 rounded-xl border-white/[0.15] bg-transparent text-[15px] font-semibold text-white/70 hover:border-white/25"
                      >
                        <Mail className="h-4 w-4 shrink-0" />
                        {actionLoading === "email" ? "Enviando…" : "Enviar QR por Email"}
                      </Button>
                      <div className="pt-4 text-center">
                        <button
                          type="button"
                          disabled={
                            actionLoading !== null ||
                            detail.status === "USED" ||
                            detail.status === "CANCELLED"
                          }
                          onClick={() => setCancelConfirming(true)}
                          className="text-[14px] text-red-500/60 transition-colors hover:text-red-500/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                          Anular Entrada
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-6 py-5">
                      <p className="text-[15px] leading-relaxed text-white/60">
                        ¿Confirmás que querés anular esta entrada? Esta acción no se puede
                        deshacer.
                      </p>
                    </div>
                    <div className="space-y-2 border-t border-white/[0.06] p-4">
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 w-full rounded-xl text-[15px] font-semibold"
                        disabled={actionLoading === "cancel"}
                        onClick={() => void handleConfirmCancelTicket()}
                      >
                        {actionLoading === "cancel" ? "Anulando…" : "Anular entrada"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full rounded-xl border-white/[0.15] bg-transparent text-[15px] font-semibold text-white/70 hover:border-white/25"
                        disabled={actionLoading === "cancel"}
                        onClick={() => setCancelConfirming(false)}
                      >
                        Volver
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : null}
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
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-medium text-white/40">{label}</p>
      {children}
    </div>
  )
}
