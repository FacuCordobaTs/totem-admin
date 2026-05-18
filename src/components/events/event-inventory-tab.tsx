import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronRight, Plus, Wine } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventMenuProductRow, EventMenuProductsResponse } from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const inputClass =
  "h-11 rounded-xl border-white/[0.1] bg-white/[0.05] px-4 text-[15px] transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

type EventInvRow = {
  id: string
  name: string
  baseUnit: ApiInventoryItem["baseUnit"]
  packageSize: string
  eventInventoryId: string | null
  stockAllocated: string
  initialStock?: string | null
}

type EventInventoryListResponse = { items: EventInvRow[] }
type ProductsApi = { products: ApiProduct[] }
type MaterialsApi = { items: ApiInventoryItem[] }

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatStockWithUnit(row: EventInvRow): string {
  if (hasBottlePackage(row)) {
    const bottles = stockBaseToBottleDraft(row.stockAllocated, row.packageSize)
    const n = Number.parseFloat(bottles)
    return `${Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("es-AR")} botellas`
  }
  const n = Number.parseFloat(row.stockAllocated)
  const val = Number.isNaN(n) ? "—" : n.toLocaleString("es-AR")
  switch (row.baseUnit) {
    case "ML":
      return `${val} ml`
    case "GRAMS":
      return `${val} g`
    default:
      return `${val} unidades`
  }
}

function isLowStock(row: EventInvRow): boolean {
  if (!row.initialStock) return false
  const current = Number.parseFloat(row.stockAllocated)
  const initial = Number.parseFloat(row.initialStock)
  if (Number.isNaN(current) || Number.isNaN(initial) || initial === 0) return false
  return current / initial < 0.2
}

function bottleLoadPreview(row: { baseUnit: string; packageSize: string; name: string }, bottles: number): string {
  if (!Number.isFinite(bottles) || bottles <= 0) {
    return "Ingresá cuántas botellas sumás."
  }
  if (row.baseUnit === "UNIT") {
    return `Sumás ${bottles.toLocaleString("es-AR")} unidades al depósito del evento.`
  }
  const per = Number.parseFloat(row.packageSize ?? "0")
  if (!Number.isFinite(per) || per <= 0) {
    return "Este insumo necesita un formato definido en el catálogo antes de cargar por envases."
  }
  return `Se suman ${bottles.toLocaleString("es-AR")} envases al depósito (mismo formato que figura en el insumo).`
}

function calcProductAvailability(
  product: ApiProduct,
  eventStockMap: Map<string, number>
): number | null {
  if (!product.recipes || product.recipes.length === 0) return null
  let min = Infinity
  for (const line of product.recipes) {
    const stock = eventStockMap.get(line.inventoryItemId) ?? 0
    const qty = Number.parseFloat(line.quantityUsed)
    if (!Number.isFinite(qty) || qty <= 0) continue
    min = Math.min(min, Math.floor(stock / qty))
  }
  return min === Infinity ? null : Math.max(0, min)
}

type Props = {
  eventId: string
  onLogisticsChange?: () => void
}

export function EventInventoryTab({ eventId, onLogisticsChange }: Props) {
  const token = useAuthStore((s) => s.token)

  const [insumos, setInsumos] = useState<EventInvRow[]>([])
  const [catalogProducts, setCatalogProducts] = useState<ApiProduct[]>([])
  const [catalogMaterials, setCatalogMaterials] = useState<ApiInventoryItem[]>([])
  const [eventMenuRows, setEventMenuRows] = useState<EventMenuProductRow[]>([])
  const [loading, setLoading] = useState(true)

  // Product editor dialog
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProduct, setEditorProduct] = useState<ApiProduct | null>(null)
  const [editorPriceOverride, setEditorPriceOverride] = useState<string | null>(null)

  // Product picker dialog
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerTogglingId, setPickerTogglingId] = useState<string | null>(null)

  // Bottle loading dialog
  const [bottleOpen, setBottleOpen] = useState(false)
  const [bottleItemId, setBottleItemId] = useState<string>("")
  const [bottleCount, setBottleCount] = useState("1")
  const [bottleSaving, setBottleSaving] = useState(false)
  const [bottleCostType, setBottleCostType] = useState<"TOTAL" | "UNIT">("TOTAL")
  const [bottleCostAmount, setBottleCostAmount] = useState("")

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [insRes, productsRes, materialsRes, menuRes] = await Promise.all([
        apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token }),
        apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
        apiFetch<MaterialsApi>("/inventory/items", { method: "GET", token }),
        apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token }),
      ])
      setInsumos(insRes.items)
      setCatalogProducts(productsRes.products)
      setCatalogMaterials(materialsRes.items)
      setEventMenuRows(menuRes.products)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el inventario")
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const eventStockMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const ins of insumos) {
      const n = Number.parseFloat(ins.stockAllocated)
      if (Number.isFinite(n)) map.set(ins.id, n)
    }
    return map
  }, [insumos])

  const activeMenuProducts = useMemo(
    () => eventMenuRows.filter((p) => p.isActiveForEvent && p.catalogIsActive !== false),
    [eventMenuRows]
  )

  const stockItems = useMemo(
    () => insumos.filter((ins) => Number.parseFloat(ins.stockAllocated) > 0),
    [insumos]
  )

  const pickerFilteredProducts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return catalogProducts
    return catalogProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [catalogProducts, pickerSearch])

  function openEditor(menuRow: EventMenuProductRow) {
    const full = catalogProducts.find((p) => p.id === menuRow.id) ?? null
    setEditorProduct(full)
    setEditorPriceOverride(menuRow.priceOverride ?? null)
    setEditorOpen(true)
  }

  function openEditorCreate() {
    setEditorProduct(null)
    setEditorPriceOverride(null)
    setEditorOpen(true)
    setPickerOpen(false)
  }

  function openBottleFor(row: EventInvRow) {
    setBottleItemId(row.id)
    setBottleCount("1")
    setBottleCostType("TOTAL")
    setBottleCostAmount("")
    setBottleOpen(true)
  }

  function openBottlePicker() {
    setBottleItemId(catalogMaterials[0]?.id ?? "")
    setBottleCount("1")
    setBottleCostType("TOTAL")
    setBottleCostAmount("")
    setBottleOpen(true)
  }

  async function submitBottleLoad(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !bottleItemId) return
    const n = Number.parseInt(bottleCount, 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Cantidad de botellas inválida")
      return
    }
    setBottleSaving(true)
    try {
      const costRaw = bottleCostAmount.trim().replace(",", ".")
      const costN = costRaw === "" ? NaN : Number.parseFloat(costRaw)
      const withCost = costRaw !== "" && Number.isFinite(costN) && costN > 0
      const body: Record<string, unknown> = {
        inventoryItemId: bottleItemId,
        quantityOfBottles: n,
        eventId,
      }
      if (withCost) {
        body.costType = bottleCostType
        body.costAmount = costN
      }
      await apiFetch("/inventory/load-bottles", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      toast.success("Carga sumada al stock del evento")
      setBottleOpen(false)
      onLogisticsChange?.()
      await loadAll()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo registrar la carga")
    } finally {
      setBottleSaving(false)
    }
  }

  async function toggleProductInMenu(productId: string, active: boolean) {
    if (!token || pickerTogglingId === productId) return
    setPickerTogglingId(productId)
    try {
      await apiFetch(`/events/${eventId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId, isActive: active }),
      })
      await loadAll()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el menú")
    } finally {
      setPickerTogglingId(null)
    }
  }

  const bottleTarget = catalogMaterials.find((m) => m.id === bottleItemId) ?? null

  if (loading) {
    return (
      <div className="space-y-10">
        <div className="h-8 w-32 animate-pulse rounded-xl bg-white/[0.05]" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* Menú del evento */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-[18px] font-semibold text-white">Menú del evento</h3>
          <button
            type="button"
            onClick={() => {
              setPickerSearch("")
              setPickerOpen(true)
            }}
            className="flex items-center gap-1.5 text-[13px] text-white/35 transition-colors hover:text-white/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar producto
          </button>
        </div>

        {activeMenuProducts.length === 0 ? (
          <p className="py-4 text-[14px] text-white/30">
            Todavía no hay productos en el menú.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {activeMenuProducts.map((p) => {
              const full = catalogProducts.find((cp) => cp.id === p.id) ?? null
              const availability = full ? calcProductAvailability(full, eventStockMap) : null
              const effectivePrice = p.priceOverride && p.priceOverride !== "" ? p.priceOverride : p.price
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openEditor(p)}
                  className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{p.name}</p>
                    <p className="mt-0.5 text-[13px] text-white/40">
                      {formatMoneyArs(effectivePrice)}
                      {p.priceOverride && p.priceOverride !== "" ? (
                        <span className="ml-2 text-white/25">precio especial</span>
                      ) : null}
                    </p>
                  </div>
                  {availability !== null ? (
                    <span className="shrink-0 text-[13px] text-white/30">
                      {availability} tragos
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Stock del evento */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-[18px] font-semibold text-white">Stock del evento</h3>
          <button
            type="button"
            onClick={openBottlePicker}
            className="flex items-center gap-1.5 text-[13px] text-white/35 transition-colors hover:text-white/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Cargar stock
          </button>
        </div>

        {stockItems.length === 0 ? (
          <p className="py-4 text-[14px] text-white/30">No hay stock cargado para este evento.</p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {stockItems.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openBottleFor(row)}
                className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-white">{row.name}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[13px]",
                    isLowStock(row) ? "text-[#FF9500]" : "text-white/40"
                  )}
                >
                  {formatStockWithUnit(row)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product editor dialog */}
      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editorProduct}
        priceOverride={editorPriceOverride}
        eventId={eventId}
        materials={catalogMaterials}
        token={token}
        onSaved={() => void loadAll()}
        onRemovedFromMenu={() => void loadAll()}
        onDeletedFromCatalog={() => void loadAll()}
      />

      {/* Product picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[80vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-md">
          <DialogHeader className="border-b border-white/[0.06] px-6 py-5">
            <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
              Agregar al menú
            </DialogTitle>
          </DialogHeader>
          <div className="border-b border-white/[0.06] px-6 py-3">
            <Input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Buscar producto…"
              className={cn(inputClass, "h-10")}
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {pickerFilteredProducts.length === 0 ? (
              <p className="px-6 py-10 text-center text-[14px] text-white/30">
                No hay productos que coincidan.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {pickerFilteredProducts.map((p) => {
                  const isInMenu = eventMenuRows.some(
                    (r) => r.id === p.id && r.isActiveForEvent
                  )
                  const isToggling = pickerTogglingId === p.id
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-6 py-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-white">{p.name}</p>
                        <p className="text-[12px] text-white/35">{formatMoneyArs(p.price)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => void toggleProductInMenu(p.id, !isInMenu)}
                        className={cn(
                          "h-8 shrink-0 rounded-lg px-3 text-[12px] font-semibold transition-colors",
                          isInMenu
                            ? "bg-[#FF9500]/10 text-[#FF9500]"
                            : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1]"
                        )}
                      >
                        {isToggling ? "…" : isInMenu ? "En el menú" : "Agregar"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="border-t border-white/[0.06] px-6 py-4">
              <button
                type="button"
                onClick={openEditorCreate}
                className="text-[13px] text-white/35 transition-colors hover:text-white/60"
              >
                + Crear producto nuevo
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottle loading dialog */}
      <Dialog open={bottleOpen} onOpenChange={(o) => { if (!o) setBottleOpen(false) }}>
        <DialogContent className="max-h-[min(90vh,760px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-md">
          <div className="border-b border-white/[0.06] p-6">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
                <Wine className="h-6 w-6 text-white/30" />
              </span>
              <DialogHeader className="flex-1 text-left">
                <DialogTitle className="text-[22px] font-bold tracking-tight text-white">
                  Cargar stock
                </DialogTitle>
                <p className="mt-1 text-[13px] text-white/40">
                  Sumá envases al depósito del evento.
                </p>
              </DialogHeader>
            </div>
          </div>
          <form onSubmit={submitBottleLoad} className="flex flex-col overflow-y-auto">
            <div className="space-y-6 p-8 pt-6">
              {/* Insumo selector */}
              <div className="space-y-3">
                <label className="text-[13px] text-white/45">Insumo</label>
                <Select
                  value={bottleItemId}
                  onValueChange={setBottleItemId}
                >
                  <SelectTrigger className={cn(inputClass, "h-12")}>
                    <SelectValue placeholder="Seleccioná un insumo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/[0.08]">
                    {catalogMaterials.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="rounded-lg py-2">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-[13px] text-white/45">Cantidad de botellas</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={bottleCount}
                  onChange={(e) => setBottleCount(e.target.value)}
                  className={cn(inputClass, "h-12 font-mono text-[17px]")}
                  required
                />
              </div>

              {bottleTarget ? (
                <div className="rounded-xl bg-white/[0.04] px-4 py-3">
                  <p className="text-[14px] text-white/70">
                    {bottleLoadPreview(bottleTarget, Number.parseInt(bottleCount, 10) || 0)}
                  </p>
                </div>
              ) : null}

              <div className="space-y-3">
                <p className="text-[13px] text-white/45">Costo (opcional)</p>
                <Select
                  value={bottleCostType}
                  onValueChange={(v) => setBottleCostType(v as "TOTAL" | "UNIT")}
                >
                  <SelectTrigger className={cn(inputClass, "h-12")} aria-label="Tipo de costo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="TOTAL">Costo total de la compra</SelectItem>
                    <SelectItem value="UNIT">Costo por botella</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Monto en ARS"
                  value={bottleCostAmount}
                  onChange={(e) => setBottleCostAmount(e.target.value)}
                  className={cn(inputClass, "h-12 font-mono")}
                />
                {(() => {
                  const n = Number.parseInt(bottleCount, 10)
                  const raw = bottleCostAmount.trim().replace(",", ".")
                  const c = raw === "" ? NaN : Number.parseFloat(raw)
                  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(c) || c <= 0) return null
                  const total = bottleCostType === "UNIT" ? c * n : c
                  return (
                    <p className="text-[14px] font-medium text-white/60">
                      Se registrará un gasto total de {formatMoneyArs(total.toFixed(2))}.
                    </p>
                  )
                })()}
              </div>
            </div>
            <div className="border-t border-white/[0.06] bg-black/40 p-5">
              <DialogFooter className="flex-col gap-3 sm:flex-col">
                <Button
                  type="submit"
                  disabled={bottleSaving || !bottleItemId}
                  className="h-12 w-full rounded-xl bg-[#FF9500] text-[16px] font-semibold text-white"
                >
                  {bottleSaving ? "Sumando…" : "Sumar al stock del evento"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBottleOpen(false)}
                  className="h-11 w-full rounded-xl border-white/[0.15] bg-transparent text-white/70 hover:border-white/25"
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
