import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  BarInventoryApiResponse,
  BarInventoryItemRow,
  BarMenuProductRow,
  BarMenuProductsApiResponse,
  EventBarRow,
} from "@/types/event-dashboard"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Package, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"

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

function unitLabel(unit: BarInventoryItemRow["baseUnit"]): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMS":
      return "g"
    default:
      return "uds."
  }
}

const inputClass =
  "h-10 rounded-xl border-zinc-200/50 bg-white px-3 font-mono tabular-nums text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  bar: EventBarRow | null
}

export function BarConfigSheet({ open, onOpenChange, eventId, bar }: Props) {
  const token = useAuthStore((s) => s.token)
  const [menuProducts, setMenuProducts] = useState<BarMenuProductRow[]>([])
  const [inventoryItems, setInventoryItems] = useState<BarInventoryItemRow[]>([])
  const [draftStock, setDraftStock] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(
    () => new Set()
  )
  const [applyingIds, setApplyingIds] = useState<Set<string>>(() => new Set())
  const [section, setSection] = useState<"menu" | "stock">("menu")

  function addApplying(id: string) {
    setApplyingIds((prev) => new Set(prev).add(id))
  }

  function removeApplying(id: string) {
    setApplyingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const loadAll = useCallback(async () => {
    if (!token || !bar) return
    setLoading(true)
    setLoadError(null)
    try {
      const q = new URLSearchParams({ eventId })
      const [menuRes, invRes] = await Promise.all([
        apiFetch<BarMenuProductsApiResponse>(
          `/bars/${bar.id}/products?${q.toString()}`,
          { method: "GET", token }
        ),
        apiFetch<BarInventoryApiResponse>(`/bars/${bar.id}/inventory`, {
          method: "GET",
          token,
        }),
      ])
      setMenuProducts(menuRes.products)
      setInventoryItems(invRes.items)
      setDraftStock(
        Object.fromEntries(
          invRes.items.map((i) => [
            i.inventoryItemId,
            hasBottlePackage(i)
              ? stockBaseToBottleDraft(i.barCurrentStock, i.packageSize)
              : i.barCurrentStock,
          ])
        )
      )
    } catch (e) {
      setMenuProducts([])
      setInventoryItems([])
      setDraftStock({})
      setLoadError(
        e instanceof ApiError ? e.message : "No se pudo cargar la configuración"
      )
    } finally {
      setLoading(false)
    }
  }, [token, bar, eventId])

  useEffect(() => {
    if (open && bar) {
      void loadAll()
      setSection("menu")
    }
  }, [open, bar, loadAll])

  function addProductPending(id: string) {
    setPendingProductIds((prev) => new Set(prev).add(id))
  }

  function removeProductPending(id: string) {
    setPendingProductIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function onProductToggle(p: BarMenuProductRow, next: boolean) {
    if (!token || !bar || pendingProductIds.has(p.id)) return
    const prev = menuProducts
    setMenuProducts((rows) =>
      rows.map((r) => (r.id === p.id ? { ...r, isActiveForBar: next } : r))
    )
    addProductPending(p.id)
    try {
      await apiFetch(`/bars/${bar.id}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: p.id, isActive: next }),
      })
    } catch (e) {
      setMenuProducts(prev)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el menú"
      )
    } finally {
      removeProductPending(p.id)
    }
  }

  async function applyStock(item: BarInventoryItemRow) {
    if (!token || !bar || applyingIds.has(item.inventoryItemId)) return
    const raw = (draftStock[item.inventoryItemId] ?? item.barCurrentStock)
      .trim()
      .replace(",", ".")
    const n = Number.parseFloat(raw)
    if (Number.isNaN(n) || n < 0) {
      toast.error("Ingresá una cantidad válida (≥ 0)")
      return
    }

    const prevItems = inventoryItems
    const prevDrafts = draftStock
    const usePackages = hasBottlePackage(item)
    addApplying(item.inventoryItemId)

    try {
      const res = await apiFetch<{ ok: boolean; currentStock: string }>(
        `/bars/${bar.id}/inventory`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            inventoryItemId: item.inventoryItemId,
            stockToAddOrSet: n,
            stockInputAs: usePackages ? "PACKAGES" : "BASE_UNITS",
          }),
        }
      )
      const applied = res.currentStock ?? n.toFixed(2)
      setInventoryItems((rows) =>
        rows.map((r) =>
          r.inventoryItemId === item.inventoryItemId
            ? { ...r, barCurrentStock: applied }
            : r
        )
      )
      setDraftStock((d) => ({
        ...d,
        [item.inventoryItemId]: usePackages
          ? stockBaseToBottleDraft(applied, item.packageSize)
          : applied,
      }))
      toast.success("Stock de barra actualizado")
    } catch (e) {
      setInventoryItems(prevItems)
      setDraftStock(prevDrafts)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el stock"
      )
    } finally {
      removeApplying(item.inventoryItemId)
    }
  }

  if (!bar) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-zinc-200/50 bg-[#F2F2F7] p-0 dark:border-zinc-800/50 dark:bg-black sm:max-w-xl"
      >
        <SheetHeader className="border-b border-zinc-200/50 bg-white/70 px-5 py-6 pr-14 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
              <SlidersHorizontal className="h-6 w-6 text-[#FF9500]" />
            </span>
            <div className="min-w-0 text-left">
              <SheetTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                Configurar barra
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                <span className="font-semibold text-black dark:text-white">
                  {bar.name}
                </span>{" "}
                · Menú del evento y stock físico asignado a este punto de venta.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center px-5 py-14 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            Cargando…
          </div>
        ) : loadError ? (
          <div className="mx-5 my-5 rounded-2xl border border-red-200/60 bg-red-50 px-4 py-3 text-[15px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {loadError}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-5 pt-5">
              <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200/50 bg-white p-1 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                {(
                  [
                    { id: "menu" as const, label: "Menú" },
                    { id: "stock" as const, label: "Stock" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSection(t.id)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-200 active:opacity-50",
                      section === t.id
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "text-[#8E8E93] hover:bg-[#F2F2F7] dark:text-[#98989D] dark:hover:bg-zinc-800/50"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {section === "menu" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {menuProducts.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay productos activos en el menú del evento. Activá productos en{" "}
                    <span className="font-semibold text-black dark:text-white">
                      Inventario del evento
                    </span>
                    .
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/50 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white dark:divide-zinc-800/50 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                    {menuProducts.map((p) => {
                      const busy = pendingProductIds.has(p.id)
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 active:bg-[#F2F2F7]/80 dark:active:bg-zinc-800/40"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF9500]/15">
                            <Package className="h-4 w-4 text-[#FF9500]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight text-black dark:text-white">
                              {p.name}
                            </p>
                            <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                              {formatMoneyArs(p.price)}
                            </p>
                          </div>
                          <Switch
                            checked={p.isActiveForBar}
                            disabled={busy}
                            onCheckedChange={(v) => void onProductToggle(p, v)}
                            aria-label={
                              p.isActiveForBar
                                ? `Quitar ${p.name} del menú de la barra`
                                : `Vender ${p.name} en esta barra`
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {inventoryItems.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay insumos en el catálogo. Agregalos en{" "}
                    <span className="font-semibold text-black dark:text-white">
                      Inventario del evento
                    </span>{" "}
                    o en Inventario PRO.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-white dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Ítem
                          </TableHead>
                          <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D] sm:table-cell">
                            Evento
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            En barra
                          </TableHead>
                          <TableHead className="min-w-[220px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            Ajustar
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryItems.map((item) => {
                          const applying = applyingIds.has(item.inventoryItemId)
                          return (
                            <TableRow
                              key={item.inventoryItemId}
                              className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                            >
                              <TableCell className="py-3">
                                <div>
                                  <p className="font-semibold text-black dark:text-white">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] text-[#8E8E93] dark:text-[#98989D]">
                                    {unitLabel(item.baseUnit)}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden py-3 tabular-nums text-[#8E8E93] dark:text-[#98989D] sm:table-cell">
                                {item.eventStockAllocated}
                              </TableCell>
                              <TableCell className="py-3 font-mono font-medium tabular-nums text-black dark:text-white">
                                {item.barCurrentStock}
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    className={inputClass}
                                    value={
                                      draftStock[item.inventoryItemId] ??
                                      item.barCurrentStock
                                    }
                                    disabled={applying}
                                    onChange={(e) =>
                                      setDraftStock((d) => ({
                                        ...d,
                                        [item.inventoryItemId]: e.target.value,
                                      }))
                                    }
                                  />
                                  <Button
                                    type="button"
                                    disabled={applying}
                                    onClick={() => void applyStock(item)}
                                    className="h-10 shrink-0 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
                                  >
                                    {applying ? "…" : "Actualizar"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
