import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, SlidersHorizontal, Wine } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  BarInventoryApiResponse,
  BarInventoryItemRow,
  BarMenuProductRow,
  BarMenuProductsApiResponse,
  EventAssignmentStaffRow,
  EventBarRow,
  EventBarsResponse,
  EventSaleRowApi,
  EventSalesPageResponse,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { staffRoleLabel } from "@/lib/role-labels"
import { BarConfigSheet } from "@/components/events/bar-config-sheet"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const headClass = "text-[11px] font-normal lowercase text-white/45"
const badgeClass =
  "rounded-md bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/40"

function money(value: string | number): string {
  const n = typeof value === "number" ? value : Number.parseFloat(value)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function saleDate(value: Date | string | null): string {
  const d = value ? new Date(value) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—"
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

const SOURCE_LABEL: Record<EventSaleRowApi["source"], string> = {
  POS: "POS",
  APP: "App",
  WEB: "Web",
}

/** Igual criterio que el resto de Barra: nunca mostrar ml/g, sino envases contables. */
function countableStock(item: BarInventoryItemRow): string {
  if (hasBottlePackage(item)) {
    const n = Number.parseFloat(stockBaseToBottleDraft(item.barCurrentStock, item.packageSize))
    return Number.isNaN(n) ? "0" : Math.round(n).toLocaleString("es-AR")
  }
  const n = Number.parseFloat(item.barCurrentStock)
  return Number.isNaN(n) ? "0" : Math.floor(n).toLocaleString("es-AR")
}

type Props = {
  eventId: string
  barId: string
  trackStock?: boolean
  onBack: () => void
  onChanged?: () => void
}

/**
 * Pantalla interna de la sección Barra: reemplaza todo el contenido de la sección
 * (barras + menú + stock) mientras está abierta. Muestra el detalle completo del punto
 * de venta y sus ventas. La configuración profunda sigue viviendo en `BarConfigSheet`.
 */
export function BarDetailView({ eventId, barId, trackStock = true, onBack, onChanged }: Props) {
  const token = useAuthStore((s) => s.token)
  const [bar, setBar] = useState<EventBarRow | null>(null)
  const [products, setProducts] = useState<BarMenuProductRow[]>([])
  const [inventory, setInventory] = useState<BarInventoryItemRow[]>([])
  const [staff, setStaff] = useState<EventAssignmentStaffRow[]>([])
  const [sales, setSales] = useState<EventSaleRowApi[]>([])
  const [hasMoreSales, setHasMoreSales] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return
      if (!opts?.silent) setLoading(true)
      setError(null)
      try {
        const [barsRes, menuRes, invRes, staffRes, salesRes] = await Promise.all([
          apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, { method: "GET", token }),
          apiFetch<BarMenuProductsApiResponse>(`/bars/${barId}/products?eventId=${eventId}`, {
            method: "GET",
            token,
          }),
          trackStock
            ? apiFetch<BarInventoryApiResponse>(`/bars/${barId}/inventory`, { method: "GET", token })
            : Promise.resolve({ items: [] } as BarInventoryApiResponse),
          apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, { method: "GET", token }),
          apiFetch<EventSalesPageResponse>(
            `/events/${eventId}/sales?barId=${barId}&limit=200&offset=0`,
            { method: "GET", token }
          ),
        ])
        setBar(barsRes.bars.find((b) => b.id === barId) ?? null)
        setProducts(menuRes.products)
        setInventory(invRes.items)
        setStaff(staffRes.staff.filter((member) => member.barId === barId))
        setSales(salesRes.sales)
        setHasMoreSales(salesRes.hasMore)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo cargar la barra")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [token, eventId, barId, trackStock]
  )

  useEffect(() => {
    void load()
  }, [load])

  const menu = products.filter((product) => product.isActiveForBar)

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-white/45 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a Barra
      </button>

      {error ? (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-[15px] text-red-300">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="h-9 w-52 animate-pulse rounded-xl bg-white/[0.05]" />
          <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-52 animate-pulse rounded-2xl bg-white/[0.03]" />
        </div>
      ) : !bar ? (
        <p className="text-[15px] text-white/45">Esta barra ya no existe en el evento.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[22px] font-bold tracking-tight text-white">{bar.name}</h3>
                {bar.isDefault ? <span className={badgeClass}>General</span> : null}
                {bar.isActive === false ? <span className={badgeClass}>Inactiva</span> : null}
              </div>
              <p className="mt-1 text-[13px] text-white/40">
                {trackStock
                  ? "Personal, menú, stock y ventas de este punto de venta."
                  : "Personal, menú y ventas de este punto de venta."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="h-10 gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 text-white/75 hover:bg-white/[0.08]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Configurar barra
            </Button>
          </div>

          {/* Mismo tratamiento que "Total de gastos" en Finanzas. */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] lg:max-w-md">
            <div className="p-6 pb-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07]">
                  <Wine className="h-5 w-5 text-white/30" />
                </span>
                <p className="text-[13px] font-normal lowercase text-white/45">Total vendido</p>
              </div>
            </div>
            <div className="px-6 pb-6">
              <p className="text-[34px] font-bold tabular-nums tracking-tight text-white">
                {money(bar.totalSales ?? "0")}
              </p>
              <p className="mt-2 text-[13px] text-white/40">
                {hasMoreSales
                  ? "Mostrando las últimas 200 ventas."
                  : `${sales.length} ${sales.length === 1 ? "venta registrada" : "ventas registradas"}.`}
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Ventas de esta barra
            </h4>
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className={cn(headClass, "pl-4")}>Fecha</TableHead>
                    <TableHead className={headClass}>Cliente</TableHead>
                    <TableHead className={headClass}>Detalle</TableHead>
                    <TableHead className={headClass}>Pago</TableHead>
                    <TableHead className={cn(headClass, "pr-4 text-right")}>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                  {sales.length === 0 ? (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell colSpan={5} className="py-12 text-center text-[15px] text-white/40">
                        Todavía no hay ventas en esta barra
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale) => (
                      <TableRow key={sale.id} className="border-0 transition-colors hover:bg-white/[0.03]">
                        <TableCell className="whitespace-nowrap py-3.5 pl-4 text-[13px] text-white/45">
                          {saleDate(sale.createdAt)}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <p className="truncate text-[15px] font-medium text-white">
                            {sale.customerName?.trim() || "Consumidor final"}
                          </p>
                          {sale.staffName ? (
                            <p className="truncate text-[12px] text-white/35">Atendió {sale.staffName}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate py-3.5 text-[14px] text-white/50">
                          {sale.itemsSummary}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3.5 text-[13px] text-white/50">
                          {paymentMethodLabel(sale.paymentMethod)}
                          <span className="ml-1.5 text-white/25">{SOURCE_LABEL[sale.source]}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3.5 pr-4 text-right text-[15px] font-semibold tabular-nums text-white">
                          {money(sale.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <DetailSection title="Personal asignado" count={staff.length}>
            {staff.length === 0 ? (
              <EmptyLine>Todavía no hay personal asignado a esta barra.</EmptyLine>
            ) : (
              staff.map((member, index) => (
                <DetailRow key={member.id} index={index}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-white">{member.name}</span>
                    <span className="block text-[12px] text-white/40">{staffRoleLabel(member.role)}</span>
                  </span>
                </DetailRow>
              ))
            )}
          </DetailSection>

          <DetailSection title="Menú de la barra" count={menu.length}>
            {menu.length === 0 ? (
              <EmptyLine>Todavía no hay productos asignados a esta barra.</EmptyLine>
            ) : (
              menu.map((product, index) => (
                <DetailRow key={product.id} index={index}>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#FF9500]">
                    {money(product.price)}
                  </span>
                </DetailRow>
              ))
            )}
          </DetailSection>

          {trackStock ? (
            <DetailSection title="Stock en barra" count={inventory.length}>
              {inventory.length === 0 ? (
                <EmptyLine>Todavía no hay stock asignado a esta barra.</EmptyLine>
              ) : (
                inventory.map((item, index) => (
                  <DetailRow key={item.inventoryItemId} index={index}>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[13px] text-white/35">
                      {hasBottlePackage(item) ? "botellas" : "unidades"}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[15px] font-semibold tabular-nums text-white">
                      {countableStock(item)}
                    </span>
                  </DetailRow>
                ))
              )}
            </DetailSection>
          ) : null}
        </>
      )}

      {bar ? (
        <BarConfigSheet
          open={configOpen}
          onOpenChange={setConfigOpen}
          eventId={eventId}
          trackStock={trackStock}
          bar={bar}
          onBarUpdated={() => {
            void load({ silent: true })
            onChanged?.()
          }}
        />
      ) : null}
    </div>
  )
}

function DetailSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
        {title} · {count}
      </h4>
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">{children}</div>
    </section>
  )
}

function DetailRow({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-4 py-3",
        index > 0 && "border-t border-white/[0.06]"
      )}
    >
      {children}
    </div>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[14px] text-white/30">{children}</p>
}
