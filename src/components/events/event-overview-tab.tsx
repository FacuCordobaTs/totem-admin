import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventMenuProductsResponse,
  EventSaleRowApi,
  EventSalesPageResponse,
  EventSummaryResponse,
} from "@/types/event-dashboard"
import { cn } from "@/lib/utils"

const SALES_PAGE_SIZE = 50

const cardClass =
  "rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50 "

type SaleStatus = "PENDING" | "PAYMENT_FAILED" | "COMPLETED" | "REFUNDED"

type SaleDetailSale = {
  id: string
  totalAmount: string
  paymentMethod: EventSaleRowApi["paymentMethod"]
  createdAt: Date | string | null
  source: EventSaleRowApi["source"]
  status: SaleStatus | null
  staffName: string | null
  customerName: string | null
}

type SaleDetailItem = {
  productName: string
  quantity: number
  priceAtTime: string
  lineSubtotal: string
}

type SaleDetailResponse = {
  sale: SaleDetailSale
  items: SaleDetailItem[]
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background p-6">
      <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  )
}

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatTimeOnly(value: Date | string | null): string {
  if (value == null) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDateTimeFull(value: Date | string | null): string {
  if (value == null) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function paymentMethodLabel(method: EventSaleRowApi["paymentMethod"]): string {
  switch (method) {
    case "CASH":
      return "Efectivo"
    case "CARD":
      return "Tarjeta"
    case "MERCADOPAGO":
      return "Mercado Pago"
    case "TRANSFER":
      return "Transferencia"
    default:
      return method
  }
}

function statusLabel(status: SaleStatus | null): string {
  switch (status) {
    case "COMPLETED":
      return "Completada"
    case "PENDING":
      return "Pendiente"
    case "PAYMENT_FAILED":
      return "Pago fallido"
    case "REFUNDED":
      return "Reembolsada"
    default:
      return "—"
  }
}

function paymentMethodBadge(method: EventSaleRowApi["paymentMethod"]) {
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {paymentMethodLabel(method)}
    </span>
  )
}

function statusBadge(status: SaleStatus | null) {
  const map: Record<SaleStatus, string> = {
    COMPLETED: "bg-[#34C759]/15 text-[#34C759]",
    PENDING: "bg-[#FF9500]/15 text-[#FF9500]",
    PAYMENT_FAILED: "bg-[#FF3B30]/15 text-[#FF3B30]",
    REFUNDED: "bg-[#8E8E93]/15 text-[#8E8E93] dark:text-[#98989D]",
  }
  const cls = status
    ? map[status]
    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
        cls
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

function sourceBadge(source: EventSaleRowApi["source"]) {
  switch (source) {
    case "POS":
      return (
        <span className="inline-flex rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
          POS
        </span>
      )
    case "APP":
      return (
        <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          APP
        </span>
      )
    case "WEB":
      return (
        <span className="inline-flex rounded-full bg-[#FF9500]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#FF9500]">
          WEB
        </span>
      )
    default:
      return (
        <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {source}
        </span>
      )
  }
}

function DetailRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">{label}</span>
      <span
        className={cn(
          "text-right text-[15px] tracking-tight",
          muted
            ? "text-[#8E8E93] dark:text-[#98989D]"
            : "font-medium text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

type Props = {
  eventId: string
  refreshTrigger?: number
}

export function EventOverviewTab({ eventId, refreshTrigger = 0 }: Props) {
  const token = useAuthStore((s) => s.token)

  const [summary, setSummary] = useState<EventSummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [sales, setSales] = useState<EventSaleRowApi[]>([])
  const [salesHasMore, setSalesHasMore] = useState(false)
  const [salesLoading, setSalesLoading] = useState(true)
  const [salesLoadingMore, setSalesLoadingMore] = useState(false)
  const [salesError, setSalesError] = useState<string | null>(null)

  const [menuProducts, setMenuProducts] = useState<{ id: string; name: string }[]>([])
  const [menuLoading, setMenuLoading] = useState(true)

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [saleDetail, setSaleDetail] = useState<SaleDetailResponse | null>(null)
  const [saleDetailLoading, setSaleDetailLoading] = useState(false)
  const [saleDetailError, setSaleDetailError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    if (!token) return
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const res = await apiFetch<EventSummaryResponse>(`/events/${eventId}/summary`, {
        method: "GET",
        token,
      })
      setSummary(res)
    } catch (e) {
      setSummary(null)
      setSummaryError(e instanceof ApiError ? e.message : "No se pudo cargar el resumen")
    } finally {
      setSummaryLoading(false)
    }
  }, [token, eventId, refreshTrigger])

  const loadSalesInitial = useCallback(async () => {
    if (!token) return
    setSalesLoading(true)
    setSalesError(null)
    try {
      const res = await apiFetch<EventSalesPageResponse>(
        `/events/${eventId}/sales?limit=${SALES_PAGE_SIZE}&offset=0`,
        { method: "GET", token }
      )
      setSales(res.sales)
      setSalesHasMore(res.hasMore)
    } catch (e) {
      setSales([])
      setSalesHasMore(false)
      setSalesError(
        e instanceof ApiError ? e.message : "No se pudieron cargar las ventas"
      )
    } finally {
      setSalesLoading(false)
    }
  }, [token, eventId, refreshTrigger])

  const loadMenu = useCallback(async () => {
    if (!token) return
    setMenuLoading(true)
    try {
      const res = await apiFetch<EventMenuProductsResponse>(
        `/events/${eventId}/products`,
        { method: "GET", token }
      )
      const list = res.products
        .filter((p) => p.isActiveForEvent && p.catalogIsActive !== false)
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setMenuProducts(list)
    } catch {
      setMenuProducts([])
    } finally {
      setMenuLoading(false)
    }
  }, [token, eventId, refreshTrigger])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    void loadSalesInitial()
  }, [loadSalesInitial])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

  useEffect(() => {
    if (!selectedSaleId || !token) {
      setSaleDetail(null)
      setSaleDetailError(null)
      setSaleDetailLoading(false)
      return
    }
    let cancelled = false
    setSaleDetail(null)
    setSaleDetailError(null)
    setSaleDetailLoading(true)
    void (async () => {
      try {
        const res = await apiFetch<SaleDetailResponse>(`/sales/${selectedSaleId}`, {
          method: "GET",
          token,
        })
        if (!cancelled) {
          setSaleDetail(res)
        }
      } catch (e) {
        if (!cancelled) {
          setSaleDetailError(
            e instanceof ApiError ? e.message : "No se pudo cargar la venta"
          )
        }
      } finally {
        if (!cancelled) {
          setSaleDetailLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSaleId, token])

  async function loadMoreSales() {
    if (!token || salesLoadingMore || !salesHasMore) return
    setSalesLoadingMore(true)
    try {
      const res = await apiFetch<EventSalesPageResponse>(
        `/events/${eventId}/sales?limit=${SALES_PAGE_SIZE}&offset=${sales.length}`,
        { method: "GET", token }
      )
      setSales((prev) => [...prev, ...res.sales])
      setSalesHasMore(res.hasMore)
    } catch {
      /* toast optional */
    } finally {
      setSalesLoadingMore(false)
    }
  }

  return (
    <div className="space-y-10">
      {summaryError ? (
        <p className="text-base text-red-600 dark:text-red-400">{summaryError}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Ingresos en barras"
          value={
            summaryLoading
              ? "…"
              : formatMoneyArs(summary?.barProductRevenue ?? summary?.totalRevenue ?? "0")
          }
        />
        <StatCard
          label="Consumos"
          value={summaryLoading ? "…" : String(summary?.digitalConsumptionsSold ?? "—")}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
        <div className="space-y-8 lg:col-span-2">
          <section className={cn(cardClass, "overflow-hidden")}>
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                Últimas ventas
              </h3>
              <p className="mt-1 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                Tocá una fila para ver el detalle completo de la venta.
              </p>
            </div>
            <div className="p-5 pt-4">
              {salesError ? (
                <p className="text-base text-red-600 dark:text-red-400">{salesError}</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                          <TableHead className="w-[72px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Nº
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Cliente
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Hora
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Origen
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-10">
                              <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="h-10 animate-pulse rounded-lg bg-zinc-200/50 dark:bg-zinc-700/50"
                                  />
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : sales.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="py-10 text-center text-[#8E8E93] dark:text-[#98989D]"
                            >
                              No hay ventas registradas.
                            </TableCell>
                          </TableRow>
                        ) : (
                          sales.map((s, index) => {
                            const hasName =
                              s.customerName != null && s.customerName.trim() !== ""
                            return (
                              <TableRow
                                key={s.id}
                                onClick={() => setSelectedSaleId(s.id)}
                                className="cursor-pointer border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                              >
                                <TableCell className="py-3 font-mono text-[13px] tabular-nums text-[#8E8E93] dark:text-[#98989D]">
                                  #{sales.length - index}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "py-3 text-[15px]",
                                    hasName
                                      ? "font-medium text-foreground"
                                      : "text-[#8E8E93] dark:text-[#98989D]"
                                  )}
                                >
                                  {hasName ? s.customerName : "Consumidor Final"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-3 text-[15px] tabular-nums text-[#8E8E93] dark:text-[#98989D]">
                                  {formatTimeOnly(s.createdAt)}
                                </TableCell>
                                <TableCell className="py-3">
                                  {sourceBadge(s.source)}
                                </TableCell>
                                <TableCell className="py-3 text-right text-[15px] font-bold tabular-nums text-foreground">
                                  {formatMoneyArs(s.totalAmount)}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {salesHasMore ? (
                    <div className="mt-4 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={salesLoadingMore}
                        onClick={() => void loadMoreSales()}
                        className="h-10 rounded-xl border-zinc-200/50 px-6 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
                      >
                        {salesLoadingMore ? "Cargando…" : "Cargar más"}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <section className={cn(cardClass, "lg:sticky lg:top-6 lg:self-start")}>
          <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">
              Menú activo
            </h3>
          </div>
          <div className="p-5 pt-4">
            {menuLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-7 animate-pulse rounded-lg bg-zinc-200/50 dark:bg-zinc-700/50"
                  />
                ))}
              </div>
            ) : menuProducts.length === 0 ? (
              <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                Ningún producto activo. Activá ítems en Inventario del evento.
              </p>
            ) : (
              <ul className="max-h-[min(50vh,420px)] divide-y divide-zinc-200/50 overflow-y-auto rounded-xl border border-zinc-200/50 dark:divide-zinc-800/50 dark:border-zinc-800/50">
                {menuProducts.map((p) => (
                  <li
                    key={p.id}
                    className="px-4 py-3 text-[17px] font-medium leading-snug text-black dark:text-white"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Sheet
        open={selectedSaleId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedSaleId(null)
        }}
      >
        <SheetContent className="bg-white dark:border-zinc-800/50 dark:bg-background">
          <SheetHeader className="border-b border-zinc-200/50 px-6 py-4 dark:border-zinc-800/50">
            <SheetTitle className="text-[17px] font-semibold tracking-tight text-foreground">
              Detalle de venta
            </SheetTitle>
            <SheetDescription className="sr-only">
              Información completa de la venta seleccionada.
            </SheetDescription>
          </SheetHeader>

          {saleDetailLoading ? (
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="space-y-3">
                <div className="h-3 w-12 animate-pulse rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
                <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
                <div className="flex gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-200/60 dark:bg-zinc-800/60" />
                  <div className="h-6 w-24 animate-pulse rounded-full bg-zinc-200/60 dark:bg-zinc-800/60" />
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-9 animate-pulse rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60"
                  />
                ))}
              </div>
            </div>
          ) : saleDetailError ? (
            <div className="flex-1 p-6">
              <p className="text-base text-red-600 dark:text-red-400">
                {saleDetailError}
              </p>
            </div>
          ) : saleDetail ? (
            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-zinc-200/50 px-6 py-6 dark:border-zinc-800/50">
                <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Total
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatMoneyArs(saleDetail.sale.totalAmount)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {paymentMethodBadge(saleDetail.sale.paymentMethod)}
                  {statusBadge(saleDetail.sale.status)}
                  {sourceBadge(saleDetail.sale.source)}
                </div>
              </div>

              <div className="border-b border-zinc-200/50 px-6 py-3 dark:border-zinc-800/50">
                <DetailRow
                  label="Fecha"
                  value={formatDateTimeFull(saleDetail.sale.createdAt)}
                />
                <DetailRow
                  label="Cliente"
                  value={
                    saleDetail.sale.customerName &&
                    saleDetail.sale.customerName.trim() !== ""
                      ? saleDetail.sale.customerName
                      : "Consumidor Final"
                  }
                  muted={
                    saleDetail.sale.customerName == null ||
                    saleDetail.sale.customerName.trim() === ""
                  }
                />
                <DetailRow
                  label="Atendido por"
                  value={saleDetail.sale.staffName ?? "—"}
                  muted={saleDetail.sale.staffName == null}
                />
              </div>

              <div className="px-6 py-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Productos
                </p>
                {saleDetail.items.length === 0 ? (
                  <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    Esta venta no tiene productos asociados.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                    {saleDetail.items.map((item, i) => (
                      <li
                        key={`${item.productName}-${i}`}
                        className="flex items-baseline justify-between gap-4 py-3"
                      >
                        <p className="min-w-0 flex-1 text-[15px] text-foreground">
                          <span className="tabular-nums text-[#8E8E93] dark:text-[#98989D]">
                            {item.quantity}
                          </span>
                          <span className="mx-1 text-[#8E8E93] dark:text-[#98989D]">
                            ×
                          </span>
                          <span className="font-medium">{item.productName}</span>
                        </p>
                        <span className="whitespace-nowrap font-mono text-[15px] font-semibold tabular-nums text-foreground">
                          {formatMoneyArs(item.lineSubtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 p-6 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              No se encontró la venta.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
