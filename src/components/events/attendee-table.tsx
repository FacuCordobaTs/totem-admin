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
import type { ApiPromoter } from "@/components/events/promoters-panel"
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
  customerId: string | null
  promoterId: string | null
  promoterName: string | null
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

function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? Number.parseFloat(price) : price
  if (Number.isNaN(n)) return "—"
  return (
    "$ " +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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
}

export type AttendeeTableHandle = {
  exportCsv: () => void
}

export const AttendeeTable = forwardRef<AttendeeTableHandle, AttendeeTableProps>(
  function AttendeeTable(
    { eventId, refreshTrigger, hideExportButton = false, onSaleCompleted, allowSale = true },
    ref
  ) {
    const token = useAuthStore((s) => s.token)

    const [rows, setRows] = useState<ApiTicketRow[]>([])
    const [ticketTypes, setTicketTypes] = useState<ApiTicketType[]>([])
    // Tarea 9.1 — Promotores activos de la productora para el selector de la venta manual.
    const [promoters, setPromoters] = useState<ApiPromoter[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
          token,
        })
        setPromoters(data.promoters.filter((p) => p.isActive))
      } catch {
        setPromoters([])
      }
    }, [token])

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
      void loadPromoters()
    }, [loadPromoters])

    useEffect(() => {
      void loadTickets()
    }, [loadTickets])

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

    const openSale = useCallback(() => {
      setSaleError(null)
      setSaleName("")
      setSaleEmail("")
      setSalePromoterId("")
      const first = ticketTypes.find((t) => t.stockLimit == null || t.sold < t.stockLimit)
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
            ...(salePromoterId !== ""
              ? { promoterId: salePromoterId }
              : {}),
          }),
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
    }, [token, saleTypeId, selling, eventId, saleName, saleEmail, loadTickets, loadTicketTypes, onSaleCompleted])

    const saleSelected = ticketTypes.find((t) => t.id === saleTypeId)
    const saleSoldOut =
      saleSelected != null &&
      saleSelected.stockLimit != null &&
      saleSelected.sold >= saleSelected.stockLimit

    const showFilters = true

    return (
      <section className="w-full space-y-5">
        {/* Header: title + filters (ocultos hasta que haya asistentes) */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-2xl font-bold tracking-tight text-foreground">
            Asistentes
          </h2>
          {showFilters && (
            <>
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
              <div className="relative basis-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <Input
                  placeholder="Buscar asistente"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-xl border-white/[0.1] bg-white/[0.05] pl-8 text-[13px] shadow-none placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
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
              <Select value={filterSource} onValueChange={(v) => setFilterSource(v as typeof filterSource)}>
                <SelectTrigger className={cn(filterTriggerClass, "min-w-[115px]")}><SelectValue placeholder="Origen" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos los orígenes</SelectItem>
                  <SelectItem value="promoter">Promotores</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="direct">Directa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPromoterId} onValueChange={setFilterPromoterId}>
                <SelectTrigger className={cn(filterTriggerClass, "min-w-[135px]")}><SelectValue placeholder="Promotor" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos los promotores</SelectItem>
                  {promoters.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {error ? (
          <p className="text-[15px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        {/* Nueva venta */}
        {allowSale ? (
          <>
            <Button
                type="button"
                onClick={openSale}
                className="ml-auto h-10 rounded-xl bg-[#FF9500] px-4 text-white hover:bg-[#FF9500]/90"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nueva venta
            </Button>
            <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
              <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto rounded-2xl border-white/[0.10] bg-black p-0 text-white">
              <div className="space-y-4 p-5">
                <p className="text-[15px] font-semibold text-white">Nueva venta</p>

                {saleError ? (
                  <p className="rounded-xl border border-red-900/50 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
                    {saleError}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {ticketTypes.map((t) => {
                    const isSoldOut = t.stockLimit != null && t.sold >= t.stockLimit
                    const isSelected = saleTypeId === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => setSaleTypeId(t.id)}
                        className={cn(
                          "rounded-xl border px-3.5 py-2 text-left transition-colors",
                          isSelected
                            ? "border-[#FF9500]/50 bg-[#FF9500]/[0.08]"
                            : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
                          isSoldOut && "opacity-40"
                        )}
                      >
                        <span
                          className={cn(
                            "block text-[14px] font-medium",
                            isSelected ? "text-white" : "text-white/60"
                          )}
                        >
                          {t.name}
                        </span>
                        <span className="text-[12px] text-white/35">
                          {isSoldOut ? "agotado" : formatPrice(t.effectivePrice ?? t.price)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={saleName}
                    onChange={(e) => setSaleName(e.target.value)}
                    placeholder="Nombre (opcional)"
                    autoComplete="name"
                    className="h-10 rounded-xl border-white/[0.1] bg-white/[0.05] text-[14px] placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
                  />
                  <Input
                    type="email"
                    value={saleEmail}
                    onChange={(e) => setSaleEmail(e.target.value)}
                    placeholder="Correo (opcional)"
                    autoComplete="email"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !saleSoldOut) void submitSale()
                    }}
                    className="h-10 rounded-xl border-white/[0.1] bg-white/[0.05] text-[14px] placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
                  />
                </div>

                {/* Tarea 9.1 — Atribución de la venta manual a un promotor (opcional). */}
                <Select
                  value={salePromoterId === "" ? "none" : salePromoterId}
                  onValueChange={(v) =>
                    setSalePromoterId(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-white/[0.1] bg-white/[0.05] text-[14px] shadow-none placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0">
                    <SelectValue placeholder="Promotor (opcional)" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none" className="rounded-lg">
                      Sin promotor
                    </SelectItem>
                    {promoters.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="rounded-lg">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  onClick={() => void submitSale()}
                  disabled={selling || !saleTypeId || saleSoldOut}
                  className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40"
                >
                  {selling ? "Emitiendo…" : "Confirmar venta"}
                </Button>
              </div>
              </DialogContent>
            </Dialog>
          </>
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
                <TableHead className="pr-4 text-[11px] font-normal lowercase text-white/45">
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
                    <TableCell
                      colSpan={6}
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
                      <TableCell className="py-3.5 pr-4 text-[12px] text-white/45">
                        {t.promoterName ? `Promotor · ${t.promoterName}` : t.customerId ? "Web" : "Directa"}
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
