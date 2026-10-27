import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { TicketQrDialog } from "@/components/events/ticket-qr-dialog"
import type { ApiTicketType } from "@/components/events/ticket-types"
import type { ApiPromoter } from "@/components/events/promoters-panel"
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  Plus,
  QrCode,
  Search,
  Ticket,
  Trash2
} from "lucide-react"
import "./tickets-workspace.css"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useEventNestedView } from "./event-mobile-nav"

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
  customerId: string | null
  promoterId: string | null
  promoterName: string | null
  /**
   * Si la entrada cambió de mano por "compartir entradas": quién la pasó y cuándo. El titular actual
   * ya figura en `buyerName`; la venta y el promotor siguen siendo los de la compra original.
   */
  transferredFrom?: { name: string; at: string | null } | null
}

type TicketsResponse = { tickets: ApiTicketRow[] }
type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

const filterTriggerClass =
  "h-9 min-w-[130px] rounded-xl border-white/[0.1] bg-white/[0.05] px-3 text-[13px] text-foreground shadow-none"

const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const outlineButtonClass =
  "h-10 rounded-xl border-white/[0.14] bg-transparent px-4 text-white/80 hover:bg-white/[0.06] hover:text-white"
const fieldInputClass =
  "h-11 rounded-xl border-white/[0.12] bg-white/[0.04] px-3 text-[15px] text-white placeholder:text-white/25 shadow-none focus-visible:border-[#FF9500] focus-visible:ring-0"
const detailLabelClass = "text-[12px] text-white/45"
const detailValueClass = "mt-1 text-[14px] leading-relaxed text-white"

function statusPill(status: ApiTicketRow["status"]) {
  switch (status) {
    case "PENDING":
      return <span className="text-[11px] font-normal lowercase text-white/40">emitida</span>
    case "USED":
      return <span className="text-[11px] font-normal lowercase text-white/20">usada</span>
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

function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? Number.parseFloat(price) : price
  if (Number.isNaN(n)) return "—"
  return (
    "$ " +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(n))
  )
}

function formatShortDate(value: string | null): string {
  if (value == null) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires"
  })
}

type AttendeeTableProps = {
  eventId: string
  refreshTrigger: number
  layout?: "default" | "canvas"
  hideExportButton?: boolean
  /** Se llama tras emitir una venta desde el formulario embebido, para refrescar el resto. */
  onSaleCompleted?: () => void
  /** Si es false, no se muestra el formulario de venta embebido. */
  allowSale?: boolean
  /** Avisa a la página que hay una vista enfocada (detalle o venta) abierta. */
  onEditingChange?: (editing: boolean) => void
}

export type AttendeeTableHandle = {
  exportCsv: () => void
}

export const AttendeeTable = forwardRef<AttendeeTableHandle, AttendeeTableProps>(
  function AttendeeTable(
    { eventId, refreshTrigger, hideExportButton = false, onSaleCompleted, allowSale = true, onEditingChange },
    ref
  ) {
    const token = useAuthStore((s) => s.token)

    const [rows, setRows] = useState<ApiTicketRow[]>([])
    const [ticketTypes, setTicketTypes] = useState<ApiTicketType[]>([])
    // Tarea 9.1 — Promotores activos de la productora para el selector de la venta manual.
    const [promoters, setPromoters] = useState<ApiPromoter[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<"all" | "PENDING" | "USED">("all")
    const [filterTicketTypeId, setFilterTicketTypeId] = useState<"all" | string>("all")
    const [filterSource, setFilterSource] = useState<"all" | "promoter" | "web" | "direct">("all")
    const [filterPromoterId, setFilterPromoterId] = useState<"all" | string>("all")

    const [detail, setDetail] = useState<ApiTicketRow | null>(null)
    const [qrTicketId, setQrTicketId] = useState<string | null>(null)
    const [qrBuyerName, setQrBuyerName] = useState<string | null>(null)
    const [qrOpen, setQrOpen] = useState(false)
    const [actionLoading, setActionLoading] = useState<"email" | "cancel" | null>(null)
    const [cancelConfirming, setCancelConfirming] = useState(false)

    // Venta embebida (reemplaza el modal de "Nueva venta").
    const [saleOpen, setSaleOpen] = useState(false)
    const [saleTypeId, setSaleTypeId] = useState<string>("")
    const [saleName, setSaleName] = useState("")
    const [saleEmail, setSaleEmail] = useState("")
    // Tarea 9.1 — Atribución de la venta manual a un promotor (tickets.promoter_id).
    const [salePromoterId, setSalePromoterId] = useState<string>("")
    const [selling, setSelling] = useState(false)
    const [saleError, setSaleError] = useState<string | null>(null)

    const loadPromoters = useCallback(async () => {
      if (!token) return
      try {
        const data = await apiFetch<{ promoters: ApiPromoter[] }>("/promoters", {
          method: "GET",
          token
        })
        setPromoters(data.promoters.filter((p) => p.isActive))
      } catch {
        setPromoters([])
      }
    }, [token])

    const loadTicketTypes = useCallback(async () => {
      if (!token || !eventId) return
      try {
        const data = await apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
          method: "GET",
          token
        })
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
          if (filterTicketTypeId !== "all") q.set("ticketTypeId", filterTicketTypeId)
          const data = await apiFetch<TicketsResponse>(
            `/events/${eventId}/tickets?${q.toString()}`,
            { method: "GET", token }
          )
          const next = data.tickets.map((t) => ({
            ...t,
            emailSentAt: t.emailSentAt ?? null
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
            setError(err instanceof ApiError ? err.message : "No se pudieron cargar las entradas")
          } else {
            toast.error(
              err instanceof ApiError ? err.message : "No se pudo actualizar la lista de entradas"
            )
          }
        } finally {
          if (!opts?.silent) setLoading(false)
        }
      },
      [token, eventId, filterStatus, filterTicketTypeId]
    )

    useEffect(() => {
      void loadTicketTypes()
    }, [loadTicketTypes, refreshTrigger])

    useEffect(() => {
      void loadPromoters()
    }, [loadPromoters])

    useEffect(() => {
      void loadTickets()
    }, [loadTickets, refreshTrigger])

    const filtered = useMemo(() => {
      const q = searchQuery.toLowerCase().trim()
      return rows.filter((t) => {
        if (filterSource === "promoter" && !t.promoterId) return false
        if (filterSource === "web" && !t.customerId) return false
        if (filterSource === "direct" && (t.promoterId || t.customerId)) return false
        if (filterPromoterId !== "all" && t.promoterId !== filterPromoterId) return false
        if (q === "") return true
        return (
          (t.buyerName?.toLowerCase().includes(q) ?? false) ||
          (t.buyerEmail?.toLowerCase().includes(q) ?? false) ||
          t.qrHash.toLowerCase().includes(q)
        )
      })
    }, [rows, searchQuery, filterSource, filterPromoterId])

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
    const currentPage = Math.min(page, pageCount)
    const pageOffset = (currentPage - 1) * pageSize
    const visibleRows = filtered.slice(pageOffset, pageOffset + pageSize)

    const exportCsv = useCallback(() => {
      const header = ["Nombre", "Correo", "Tipo", "Fecha compra", "Fecha uso", "Hash QR", "Estado"]
      const lines = filtered.map((r) =>
        [
          r.buyerName ?? "",
          r.buyerEmail ?? "",
          r.ticketTypeName,
          r.createdAt ?? "",
          r.scannedAt ?? "",
          r.qrHash,
          r.status
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
          token
        })
        toast.success("Email con QR enviado")
        await loadTickets({ silent: true })
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo enviar el email")
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
          token
        })
        setCancelConfirming(false)
        setDetail(null)
        toast.success("Entrada anulada")
        await loadTickets({ silent: true })
        onSaleCompleted?.()
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo anular la entrada")
      } finally {
        setActionLoading(null)
      }
    }, [token, detail, loadTickets, onSaleCompleted])

    useEffect(() => {
      if (detail == null) setCancelConfirming(false)
    }, [detail])

    const openSale = useCallback(() => {
      setSaleError(null)
      setSaleName("")
      setSaleEmail("")
      setSalePromoterId("")
      const first = ticketTypes.find(
        (t) => t.isActive !== false && (t.stockLimit == null || t.sold < t.stockLimit)
      )
      setSaleTypeId(first?.id ?? "")
      setSaleOpen(true)
    }, [ticketTypes])

    const submitSale = useCallback(async () => {
      if (!token || !saleTypeId || selling) return
      setSaleError(null)
      setSelling(true)
      try {
        const result = await apiFetch<{ ticket: ApiTicketRow }>("/tickets/sell", {
          method: "POST",
          token,
          body: JSON.stringify({
            eventId,
            ticketTypeId: saleTypeId,
            buyerName: saleName.trim(),
            buyerEmail: saleEmail.trim(),
            ...(salePromoterId !== "" ? { promoterId: salePromoterId } : {})
          })
        })
        setSaleOpen(false)
        setQrTicketId(result.ticket.id)
        setQrBuyerName(result.ticket.buyerName)
        setQrOpen(true)
        if (result.ticket.buyerEmail?.trim()) {
          try {
            await apiFetch(`/tickets/${result.ticket.id}/send-email`, { method: "POST", token })
            toast.success("Venta emitida y QR enviado por email")
          } catch {
            toast.success("Venta emitida. No se pudo enviar el email.")
          }
        } else {
          toast.success("Venta emitida")
        }
        await Promise.all([loadTickets({ silent: true }), loadTicketTypes()])
        onSaleCompleted?.()
      } catch (err) {
        setSaleError(err instanceof ApiError ? err.message : "No se pudo completar la venta")
      } finally {
        setSelling(false)
      }
    }, [
      token,
      saleTypeId,
      selling,
      eventId,
      saleName,
      saleEmail,
      salePromoterId,
      loadTickets,
      loadTicketTypes,
      onSaleCompleted
    ])

    const saleSelected = ticketTypes.find((t) => t.id === saleTypeId)
    const saleSoldOut =
      saleSelected != null &&
      (saleSelected.isActive === false ||
        (saleSelected.stockLimit != null && saleSelected.sold >= saleSelected.stockLimit))

    const showFilters = true
    const showDetail = detail !== null
    const showSale = allowSale && saleOpen
    useEventNestedView(showDetail || showSale)

    useEffect(() => {
      onEditingChange?.(showDetail || showSale)
    }, [showDetail, showSale, onEditingChange])

    useEffect(() => {
      if (showDetail || showSale) window.scrollTo({ top: 0, behavior: "auto" })
    }, [showDetail, showSale])

    if (detail) {
      return (
        <>
          <AttendeeDetail
            detail={detail}
            actionLoading={actionLoading}
            cancelConfirming={cancelConfirming}
            onBack={() => {
              setDetail(null)
              setCancelConfirming(false)
            }}
            onSendEmail={() => void handleSendQrEmail()}
            onOpenQr={() => {
              setQrTicketId(detail.id)
              setQrBuyerName(detail.buyerName)
              setQrOpen(true)
            }}
            onAskCancel={() => setCancelConfirming(true)}
            onCancelBack={() => setCancelConfirming(false)}
            onConfirmCancel={() => void handleConfirmCancelTicket()}
          />
          <TicketQrDialog
            open={qrOpen}
            onOpenChange={(open) => {
              setQrOpen(open)
              if (!open) {
                setQrTicketId(null)
                setQrBuyerName(null)
              }
            }}
            ticketId={qrTicketId}
            buyerName={qrBuyerName}
            token={token}
          />
        </>
      )
    }

    if (showSale) {
      return (
        <SaleEditor
          ticketTypes={ticketTypes}
          promoters={promoters}
          saleTypeId={saleTypeId}
          onSelectType={setSaleTypeId}
          saleName={saleName}
          onNameChange={setSaleName}
          saleEmail={saleEmail}
          onEmailChange={setSaleEmail}
          salePromoterId={salePromoterId}
          onPromoterChange={setSalePromoterId}
          error={saleError}
          selling={selling}
          soldOut={saleSoldOut}
          onSubmit={() => void submitSale()}
          onCancel={() => setSaleOpen(false)}
        />
      )
    }

    return (
      <section className="w-full space-y-5">
        {/* Header: title + filters (ocultos hasta que haya asistentes) */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-2xl font-bold tracking-tight text-foreground">Asistentes</h2>
          {showFilters && !hideExportButton && (
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
          {allowSale ? (
            <Button
              type="button"
              onClick={openSale}
              disabled={
                loading ||
                !ticketTypes.some(
                  (t) => t.isActive !== false && (t.remaining == null || t.remaining > 0)
                )
              }
              className="h-10 rounded-xl bg-[#FF9500] px-4 text-[#18120a] hover:bg-[#FF9500]/90"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva venta
            </Button>
          ) : null}
          {showFilters && (
            <>
              <div className="relative basis-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <Input
                  placeholder="Buscar asistente"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 w-full rounded-xl border-white/[0.1] bg-white/[0.05] pl-8 text-[13px] shadow-none placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
                />
              </div>
              <Select
                value={filterTicketTypeId}
                onValueChange={(v) => {
                  setFilterTicketTypeId(v)
                  setPage(1)
                }}
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
                onValueChange={(v) => {
                  setFilterStatus(v as typeof filterStatus)
                  setPage(1)
                }}
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
              <Select
                value={filterSource}
                onValueChange={(v) => {
                  setFilterSource(v as typeof filterSource)
                  setPage(1)
                }}
              >
                <SelectTrigger className={cn(filterTriggerClass, "min-w-[115px]")}>
                  <SelectValue placeholder="Origen" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos los orígenes</SelectItem>
                  <SelectItem value="promoter">Promotores</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="direct">Directa</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterPromoterId}
                onValueChange={(v) => {
                  setFilterPromoterId(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className={cn(filterTriggerClass, "min-w-[135px]")}>
                  <SelectValue placeholder="Promotor" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos los promotores</SelectItem>
                  {promoters.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {error ? <p className="text-[15px] text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="overflow-hidden rounded-2xl">
          {/* En mobile se ocultan las columnas secundarias y la tabla fija el ancho
              para truncar en una sola línea, sin scroll horizontal. */}
          <Table className="table-fixed md:table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="hidden w-10 pl-4 text-[11px] font-normal lowercase text-white/45 md:table-cell">
                  Nº
                </TableHead>
                <TableHead className="w-[46%] pl-4 text-[11px] font-normal lowercase text-white/45 md:w-auto">
                  Asistente
                </TableHead>
                <TableHead className="w-[32%] text-[11px] font-normal lowercase text-white/45 md:w-auto">
                  Tipo
                </TableHead>
                <TableHead className="w-[22%] text-[11px] font-normal lowercase text-white/45 md:w-auto">
                  Estado
                </TableHead>
                <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 md:table-cell">
                  Correo
                </TableHead>
                <TableHead className="hidden pr-4 text-[11px] font-normal lowercase text-white/45 md:table-cell">
                  Origen
                </TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-0 hover:bg-transparent">
                    <TableCell className="py-4 pl-4" colSpan={6}>
                      <div className="h-5 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ) : (
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {filtered.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-14 text-center text-[15px] text-white/40">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((t, index) => (
                    <TableRow
                      key={t.id}
                      tabIndex={0}
                      aria-label={`Ver entrada de ${t.buyerName ?? "asistente"}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setCancelConfirming(false)
                          setDetail(t)
                        }
                      }}
                      onClick={() => {
                        setCancelConfirming(false)
                        setDetail(t)
                      }}
                      className="cursor-pointer border-0 transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-[#ff9500] focus-visible:-outline-offset-2"
                    >
                      <TableCell className="hidden py-3.5 pl-4 font-mono text-[12px] tabular-nums text-zinc-600 md:table-cell">
                        {filtered.length - pageOffset - index}
                      </TableCell>
                      <TableCell className="py-3.5 pl-4 text-[15px] font-medium text-foreground">
                        <div className="truncate" title={t.buyerName ?? undefined}>
                          {t.buyerName ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-[15px] text-white/50">
                        <div className="truncate" title={t.ticketTypeName}>
                          {t.ticketTypeName}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5">{statusPill(t.status)}</TableCell>
                      <TableCell className="hidden py-3.5 pr-4 text-[13px] text-white/35 md:table-cell">
                        <div className="truncate" title={t.buyerEmail ?? undefined}>
                          {t.buyerEmail ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-3.5 pr-4 text-[12px] text-white/45 md:table-cell">
                        <div
                          className="truncate"
                          title={
                            (t.promoterName
                              ? `Promotor · ${t.promoterName}`
                              : t.customerId
                                ? "Web"
                                : "Directa") + (t.transferredFrom ? " · traspasada" : "")
                          }
                        >
                          {t.promoterName
                            ? `Promotor · ${t.promoterName}`
                            : t.customerId
                              ? "Web"
                              : "Directa"}
                          {t.transferredFrom ? " · traspasada" : ""}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </div>

        <nav className="attendee-pagination" aria-label="Paginación de asistentes">
          <span role="status" aria-live="polite">
            {loading
              ? "Cargando…"
              : filtered.length === 0
                ? "0 asistentes"
                : `${pageOffset + 1}–${Math.min(pageOffset + pageSize, filtered.length)} de ${filtered.length} asistentes`}
          </span>
          <label className="attendee-page-size">
            Por página
            <select
              aria-label="Asistentes por página"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div className="attendee-page-controls">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={loading || currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {currentPage} de {pageCount}
            </span>
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={loading || currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </nav>

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

function DetailBlock({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t border-white/[0.07] pt-7 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-8">
      <div>
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-white/70">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-white/45">{hint}</p> : null}
    </div>
  )
}

function AttendeeDetail({
  detail,
  actionLoading,
  cancelConfirming,
  onBack,
  onSendEmail,
  onOpenQr,
  onAskCancel,
  onCancelBack,
  onConfirmCancel,
}: {
  detail: ApiTicketRow
  actionLoading: "email" | "cancel" | null
  cancelConfirming: boolean
  onBack: () => void
  onSendEmail: () => void
  onOpenQr: () => void
  onAskCancel: () => void
  onCancelBack: () => void
  onConfirmCancel: () => void
}) {
  const used = detail.status === "USED"
  const hasEmail = Boolean(detail.buyerEmail?.trim())
  const canCancel = detail.status === "PENDING"

  return (
    <section className="w-full" aria-labelledby="attendee-detail-title">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Asistentes
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="attendee-detail-title"
              className="break-words text-2xl font-bold tracking-tight text-white"
            >
              {detail.buyerName?.trim() || "Sin nombre"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-white/55">
                <Ticket className="h-3.5 w-3.5" />
                {detail.ticketTypeName}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  used
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-[#FF9500]/10 text-[#FFB340]"
                )}
              >
                {used ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                {used ? "Ingresó" : "Pendiente de ingreso"}
              </span>
              <span className="text-[12px] text-white/45">
                {detail.emailSentAt ? "Email enviado" : "Sin email enviado"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onOpenQr} className={primaryButtonClass}>
              <QrCode className="h-4 w-4" />
              Ver QR
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading !== null || !hasEmail}
              onClick={onSendEmail}
              className={outlineButtonClass}
            >
              <Mail className="h-4 w-4" />
              {actionLoading === "email"
                ? "Enviando…"
                : detail.emailSentAt
                  ? "Reenviar por email"
                  : "Enviar por email"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-7 max-w-3xl pb-2">
        <DetailBlock title="Información">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className={detailLabelClass}>Correo electrónico</dt>
              <dd className="mt-1 break-all text-[14px] text-white">
                {detail.buyerEmail ? (
                  <a
                    href={`mailto:${detail.buyerEmail}`}
                    className="underline decoration-white/20 underline-offset-4 hover:decoration-[#FF9500]"
                  >
                    {detail.buyerEmail}
                  </a>
                ) : (
                  <span className="text-white/45">Sin correo</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={detailLabelClass}>Fecha de compra</dt>
              <dd className={detailValueClass}>{formatShortDate(detail.createdAt)}</dd>
            </div>
            <div>
              <dt className={detailLabelClass}>Ingreso</dt>
              <dd className={detailValueClass}>
                {detail.scannedAt ? formatShortDate(detail.scannedAt) : "Todavía no ingresó"}
              </dd>
            </div>
            <div>
              <dt className={detailLabelClass}>Origen</dt>
              <dd className={detailValueClass}>
                {detail.promoterName ? "Promotor" : detail.customerId ? "Web" : "Venta directa"}
              </dd>
            </div>
            {detail.promoterName ? (
              <div>
                <dt className={detailLabelClass}>Promotor</dt>
                <dd className={detailValueClass}>{detail.promoterName}</dd>
              </div>
            ) : null}
            {detail.transferredFrom ? (
              <div className="sm:col-span-2">
                <dt className={detailLabelClass}>Traspasada por</dt>
                <dd className={detailValueClass}>
                  {detail.transferredFrom.name}
                  <span className="mt-0.5 block text-[12px] text-white/45">
                    {formatShortDate(detail.transferredFrom.at)}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </DetailBlock>

        <DetailBlock
          title="Anular entrada"
          description={
            canCancel
              ? "El QR deja de permitir el ingreso. No se puede deshacer."
              : "Esta entrada ya ingresó: no se puede anular."
          }
        >
          {cancelConfirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[13px] text-rose-200/90">¿Confirmás la anulación?</span>
              <Button
                type="button"
                variant="ghost"
                disabled={actionLoading !== null}
                onClick={onCancelBack}
                className="h-9 rounded-lg px-2.5 text-white/60 hover:text-white"
              >
                Volver
              </Button>
              <Button
                type="button"
                disabled={actionLoading !== null}
                onClick={onConfirmCancel}
                className="h-9 rounded-lg bg-rose-500/15 px-3 text-rose-200 hover:bg-rose-500/25"
              >
                {actionLoading === "cancel" ? "Anulando…" : "Confirmar anulación"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={actionLoading !== null || !canCancel}
              onClick={onAskCancel}
              className="h-9 rounded-lg px-2.5 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Anular entrada
            </Button>
          )}
        </DetailBlock>
      </div>
    </section>
  )
}

function SaleEditor({
  ticketTypes,
  promoters,
  saleTypeId,
  onSelectType,
  saleName,
  onNameChange,
  saleEmail,
  onEmailChange,
  salePromoterId,
  onPromoterChange,
  error,
  selling,
  soldOut,
  onSubmit,
  onCancel,
}: {
  ticketTypes: ApiTicketType[]
  promoters: ApiPromoter[]
  saleTypeId: string
  onSelectType: (id: string) => void
  saleName: string
  onNameChange: (value: string) => void
  saleEmail: string
  onEmailChange: (value: string) => void
  salePromoterId: string
  onPromoterChange: (value: string) => void
  error: string | null
  selling: boolean
  soldOut: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const availableTypes = ticketTypes.filter((type) => type.isActive !== false)
  const selected = availableTypes.find((type) => type.id === saleTypeId)

  return (
    <section className="w-full" aria-labelledby="sale-title">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Asistentes
        </button>
        <h2 id="sale-title" className="text-2xl font-bold tracking-tight text-white">
          Nueva venta
        </h2>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className="mt-7 max-w-3xl space-y-7 pb-2"
        aria-label="Nueva venta"
      >
        <DetailBlock title="Entrada">
          {availableTypes.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-white/45">
              No hay tipos de entrada disponibles para vender.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Tipo de entrada" className="grid gap-2 sm:grid-cols-2">
              {availableTypes.map((type) => {
                const isSoldOut =
                  type.stockLimit != null && type.sold >= type.stockLimit
                const isSelected = saleTypeId === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isSoldOut}
                    onClick={() => onSelectType(type.id)}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9500] disabled:cursor-not-allowed disabled:opacity-40",
                      isSelected
                        ? "border-[#FF9500]/60 bg-[#FF9500]/[0.08]"
                        : "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-[14px] font-medium",
                          isSelected ? "text-white" : "text-white/70"
                        )}
                      >
                        {type.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-white/40">
                        {isSoldOut
                          ? "Agotada"
                          : type.remaining == null
                            ? "Sin límite"
                            : `${type.remaining.toLocaleString("es-AR")} disponibles`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-medium text-white/80 tabular-nums">
                      {formatPrice(type.price)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </DetailBlock>

        <DetailBlock title="Comprador">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nombre (opcional)" htmlFor="sale-name">
              <Input
                id="sale-name"
                value={saleName}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Nombre del comprador"
                autoComplete="name"
                className={fieldInputClass}
              />
            </Field>
            <Field
              label="Correo (opcional)"
              htmlFor="sale-email"
              hint="Si lo cargás, enviamos el QR."
            >
              <Input
                id="sale-email"
                type="email"
                value={saleEmail}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="comprador@correo.com"
                autoComplete="email"
                className={fieldInputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Promotor">
                <Select
                  value={salePromoterId === "" ? "none" : salePromoterId}
                  onValueChange={(value) => onPromoterChange(value === "none" ? "" : value)}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border-white/[0.12] bg-white/[0.04] text-[15px] shadow-none focus-visible:border-[#FF9500] focus-visible:ring-0">
                    <SelectValue placeholder="Sin promotor" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none" className="rounded-lg">
                      Sin promotor
                    </SelectItem>
                    {promoters.map((promoter) => (
                      <SelectItem key={promoter.id} value={promoter.id} className="rounded-lg">
                        {promoter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </DetailBlock>

        {error ? (
          <p role="alert" className="text-[13px] leading-relaxed text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6">
          <p className="text-[12px] text-white/45 tabular-nums">
            {selected
              ? `${selected.name} · ${formatPrice(selected.price)}`
              : "Elegí un tipo de entrada"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={selling}
              onClick={onCancel}
              className="h-10 rounded-xl px-4 text-white/60 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={selling || !saleTypeId || soldOut}
              className={primaryButtonClass}
            >
              {selling ? "Emitiendo…" : "Confirmar venta"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
