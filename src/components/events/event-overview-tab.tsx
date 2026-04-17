import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
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
  EventInventoryBreakdownResponse,
  EventMenuProductsResponse,
  EventSaleRowApi,
  EventSalesPageResponse,
  EventSummaryResponse,
  InventoryBreakdownItemRow,
} from "@/types/event-dashboard"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const SALES_PAGE_SIZE = 50

const cardClass =
  "rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50 "

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

function formatTime(value: Date | string | null): string {
  if (value == null) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function unitLabel(unit: InventoryBreakdownItemRow["unit"]): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMOS":
      return "g"
    default:
      return "uds."
  }
}

function formatStockDisplay(amount: string, unit: InventoryBreakdownItemRow["unit"]): string {
  const n = Number.parseFloat(amount)
  if (Number.isNaN(n)) return `${amount} ${unitLabel(unit)}`
  if (unit === "ML" && n >= 1000) {
    return `${(n / 1000).toFixed(2)} L`
  }
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${unitLabel(unit)}`
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

  const [breakdown, setBreakdown] = useState<InventoryBreakdownItemRow[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(true)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)

  const [menuProducts, setMenuProducts] = useState<{ id: string; name: string }[]>([])
  const [menuLoading, setMenuLoading] = useState(true)

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

  const loadBreakdown = useCallback(async () => {
    if (!token) return
    setBreakdownLoading(true)
    setBreakdownError(null)
    try {
      const res = await apiFetch<EventInventoryBreakdownResponse>(
        `/events/${eventId}/inventory-breakdown`,
        { method: "GET", token }
      )
      setBreakdown(res.items)
    } catch (e) {
      setBreakdown([])
      setBreakdownError(
        e instanceof ApiError ? e.message : "No se pudo cargar el mapa de stock"
      )
    } finally {
      setBreakdownLoading(false)
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
    void loadBreakdown()
  }, [loadBreakdown])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Entradas"
          value={summaryLoading ? "…" : String(summary?.ticketsSold ?? "—")}
        />
        <StatCard
          label="Ingresos"
          value={summaryLoading ? "…" : formatMoneyArs(summary?.totalRevenue ?? "0")}
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
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Hora
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Origen
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Total
                          </TableHead>
                          <TableHead className="min-w-[200px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Detalle
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-10">
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
                              colSpan={4}
                              className="py-10 text-center text-[#8E8E93] dark:text-[#98989D]"
                            >
                              No hay ventas registradas.
                            </TableCell>
                          </TableRow>
                        ) : (
                          sales.map((s) => (
                            <TableRow
                              key={s.id}
                              className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                            >
                              <TableCell className="whitespace-nowrap py-3 text-[15px]">
                                {formatTime(s.createdAt)}
                              </TableCell>
                              <TableCell className="py-3">{sourceBadge(s.source)}</TableCell>
                              <TableCell className="py-3 text-right font-mono text-[15px] font-semibold tabular-nums text-black dark:text-white">
                                {formatMoneyArs(s.totalAmount)}
                              </TableCell>
                              <TableCell className="max-w-[320px] py-3 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                                <span className="line-clamp-2">{s.itemsSummary}</span>
                              </TableCell>
                            </TableRow>
                          ))
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

          <section className={cn(cardClass, "overflow-hidden")}>
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                Stock en barras
              </h3>
            </div>
            <div className="p-5 pt-4">
              {breakdownError ? (
                <p className="text-base text-red-600 dark:text-red-400">{breakdownError}</p>
              ) : breakdownLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-lg bg-zinc-200/50 dark:bg-zinc-700/50"
                    />
                  ))}
                </div>
              ) : breakdown.length === 0 ? (
                <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                  No hay insumos con stock en este evento. Cargá insumos y cantidades en
                  Inventario del evento, o distribuí en barras.
                </p>
              ) : (
                <div className="space-y-2">
                  {breakdown.map((item) => (
                    <details
                      key={item.inventoryItemId}
                      className="group rounded-xl border border-zinc-200/50 bg-[#F2F2F7]/50 transition-colors duration-200 open:bg-background dark:border-zinc-800/50 dark:bg-black/30"
                    >
                      <summary
                        className={cn(
                          "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 active:opacity-70",
                          "marker:content-none [&::-webkit-details-marker]:hidden"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-semibold leading-tight tracking-tight text-black dark:text-white">
                            {item.itemName}
                          </p>
                          <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                            Stock del evento:{" "}
                            <span className="font-mono tabular-nums text-black dark:text-white">
                              {formatStockDisplay(item.stockAllocated, item.unit)}
                            </span>
                            {" · "}
                            En barras:{" "}
                            <span className="font-mono tabular-nums text-black dark:text-white">
                              {formatStockDisplay(item.totalInBars, item.unit)}
                            </span>
                          </p>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-500/10">
                          <ChevronDown className="h-4 w-4 text-[#8E8E93] transition-transform duration-200 group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="border-t border-zinc-200/50 pl-4 pr-4 pb-3 dark:border-zinc-800/50">
                        <ul className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50 text-[15px]">
                          {item.bars.map((b) => (
                            <li
                              key={`${item.inventoryItemId}-${b.barName}`}
                              className="flex justify-between gap-4 py-2.5 pl-0"
                            >
                              <span className="text-[#8E8E93] dark:text-[#98989D]">
                                {b.barName}
                              </span>
                              <span className="font-mono font-medium tabular-nums text-black dark:text-white">
                                {formatStockDisplay(b.stock, item.unit)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
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
    </div>
  )
}
