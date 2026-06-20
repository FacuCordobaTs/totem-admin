import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventMenuProductRow, EventMenuProductsResponse } from "@/types/event-dashboard"
import type { ApiProduct, ApiProductCategory } from "@/components/inventory/recipe-config"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
type CategoriesApi = { categories: ApiProductCategory[] }
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

function formatStockWithUnit(row: { baseUnit: string; packageSize: string; stockAllocated: string }): string {
  if (hasBottlePackage(row as EventInvRow)) {
    const bottles = stockBaseToBottleDraft(row.stockAllocated, row.packageSize)
    const n = Number.parseFloat(bottles)
    return `${Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("es-AR")} bot.`
  }
  const n = Number.parseFloat(row.stockAllocated)
  const val = Number.isNaN(n) ? "—" : n.toLocaleString("es-AR")
  switch (row.baseUnit) {
    case "ML":
      return `${val} ml`
    case "GRAMS":
      return `${val} g`
    default:
      return `${val} u.`
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
    let qty = Number.parseFloat(line.quantityUsed)
    if (!Number.isFinite(qty) || qty <= 0) continue
    // BOTTLE products: quantityUsed is in bottles, but stock is in base units (ml/g).
    // Multiply by packageSize to get the actual base-unit consumption per sale.
    if (
      product.saleType === "BOTTLE" &&
      (line.inventoryBaseUnit === "ML" || line.inventoryBaseUnit === "GRAMS")
    ) {
      const pkg = Number.parseFloat(line.inventoryPackageSize ?? "0")
      if (Number.isFinite(pkg) && pkg > 0) qty = qty * pkg
    }
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
  const [catalogCategories, setCatalogCategories] = useState<ApiProductCategory[]>([])
  const [eventMenuRows, setEventMenuRows] = useState<EventMenuProductRow[]>([])
  const [loading, setLoading] = useState(true)

  // Product editor dialog
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProduct, setEditorProduct] = useState<ApiProduct | null>(null)
  const [editorPriceOverride, setEditorPriceOverride] = useState<string | null>(null)

  // Product picker dialog (add/remove from menu)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerTogglingId, setPickerTogglingId] = useState<string | null>(null)

  // Product stock dialog (product → ingredients → load stock)
  const [prodDialogOpen, setProdDialogOpen] = useState(false)
  const [prodDialogRow, setProdDialogRow] = useState<EventMenuProductRow | null>(null)
  const [prodDialogStep, setProdDialogStep] = useState<"ingredients" | "load" | "direct-load">("ingredients")

  // Bottle loading state (used inside product stock dialog for recipe-based products)
  const [bottleItemId, setBottleItemId] = useState<string>("")
  const [bottleCount, setBottleCount] = useState("1")
  const [bottleSaving, setBottleSaving] = useState(false)
  const [bottleCostType, setBottleCostType] = useState<"TOTAL" | "UNIT">("TOTAL")
  const [bottleCostAmount, setBottleCostAmount] = useState("")

  // Direct stock loading state (for products without recipes)
  const [directCount, setDirectCount] = useState("1")
  const [directSaving, setDirectSaving] = useState(false)
  const [directCostType, setDirectCostType] = useState<"TOTAL" | "UNIT">("TOTAL")
  const [directCostAmount, setDirectCostAmount] = useState("")

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [insRes, productsRes, materialsRes, menuRes, categoriesRes] = await Promise.all([
        apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token }),
        apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
        apiFetch<MaterialsApi>("/inventory/items", { method: "GET", token }),
        apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token }),
        apiFetch<CategoriesApi>("/inventory/categories", { method: "GET", token }),
      ])
      setInsumos(insRes.items)
      setCatalogProducts(productsRes.products)
      setCatalogMaterials(materialsRes.items)
      setEventMenuRows(menuRes.products)
      setCatalogCategories(categoriesRes.categories)
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

  const pickerFilteredProducts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return catalogProducts
    return catalogProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [catalogProducts, pickerSearch])

  function openProdDialog(menuRow: EventMenuProductRow) {
    setProdDialogRow(menuRow)
    setProdDialogStep("ingredients")
    setProdDialogOpen(true)
  }

  function openEditorCreate() {
    setEditorProduct(null)
    setEditorPriceOverride(null)
    setEditorOpen(true)
    setPickerOpen(false)
  }

  function openEditorFromDialog(menuRow: EventMenuProductRow) {
    const full = catalogProducts.find((p) => p.id === menuRow.id) ?? null
    setEditorProduct(full)
    setEditorPriceOverride(menuRow.priceOverride ?? null)
    setProdDialogOpen(false)
    setEditorOpen(true)
  }

  function startStockLoad(itemId: string) {
    setBottleItemId(itemId)
    setBottleCount("1")
    setBottleCostType("TOTAL")
    setBottleCostAmount("")
    setProdDialogStep("load")
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
      onLogisticsChange?.()
      await loadAll()
      setProdDialogStep("ingredients")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo registrar la carga")
    } finally {
      setBottleSaving(false)
    }
  }

  function openDirectLoad() {
    setDirectCount("1")
    setDirectCostType("TOTAL")
    setDirectCostAmount("")
    setProdDialogStep("direct-load")
  }

  async function submitDirectLoad(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !prodDialogRow) return
    const n = Number.parseInt(directCount, 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Cantidad inválida")
      return
    }
    setDirectSaving(true)
    try {
      const costRaw = directCostAmount.trim().replace(",", ".")
      const costN = costRaw === "" ? NaN : Number.parseFloat(costRaw)
      const withCost = costRaw !== "" && Number.isFinite(costN) && costN > 0
      const body: Record<string, unknown> = {
        productId: prodDialogRow.id,
        quantity: n,
      }
      if (withCost) {
        body.costType = directCostType
        body.costAmount = costN
      }
      await apiFetch(`/events/${eventId}/products/load-direct-stock`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      toast.success("Stock cargado")
      onLogisticsChange?.()
      await loadAll()
      setProdDialogStep("ingredients")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el stock")
    } finally {
      setDirectSaving(false)
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

  // Full product data for dialog
  const prodDialogFull = prodDialogRow
    ? (catalogProducts.find((p) => p.id === prodDialogRow.id) ?? null)
    : null

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[18px] font-semibold text-white">Menú del evento</h3>
        <Button
          type="button"
          onClick={() => {
            setPickerSearch("")
            setPickerOpen(true)
          }}
          className="h-8 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 active:opacity-70"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar producto
        </Button>
      </div>

      {activeMenuProducts.length === 0 ? (
        <p className="py-4 text-[14px] text-white/30">
          Todavía no hay productos en el menú.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {activeMenuProducts.map((p) => {
            const full = catalogProducts.find((cp) => cp.id === p.id) ?? null
            const hasRecipes = (full?.recipes?.length ?? 0) > 0
            const availability = full && hasRecipes ? calcProductAvailability(full, eventStockMap) : null
            const effectivePrice = p.priceOverride && p.priceOverride !== "" ? p.priceOverride : p.price
            const directStockN = p.directStock != null ? Number.parseFloat(p.directStock) : null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openProdDialog(p)}
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
                    {availability} {full?.saleType === "BOTTLE" ? "botellas" : "tragos"}
                  </span>
                ) : !hasRecipes && directStockN !== null ? (
                  <span className={cn("shrink-0 text-[13px]", directStockN < 5 ? "text-[#FF9500]" : "text-white/30")}>
                    {Math.round(directStockN).toLocaleString("es-AR")} u.
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
              </button>
            )
          })}
        </div>
      )}

      {/* Product editor dialog */}
      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editorProduct}
        priceOverride={editorPriceOverride}
        eventId={eventId}
        materials={catalogMaterials}
        categories={catalogCategories}
        onCategoriesChanged={() => void loadAll()}
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
                    <div key={p.id} className="flex items-center gap-3 px-6 py-3.5">
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

      {/* Product stock dialog: ingredients list + inline stock loading */}
      <Dialog
        open={prodDialogOpen}
        onOpenChange={(o) => {
          if (!o) setProdDialogOpen(false)
        }}
      >
        <DialogContent className="flex max-h-[80vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-md">
          {prodDialogStep === "ingredients" ? (
            <>
              {/* Header */}
              <div className="border-b border-white/[0.06] px-6 py-5">
                <p className="text-[12px] font-medium uppercase tracking-wider text-white/25 mb-1">
                  {prodDialogRow
                    ? formatMoneyArs(
                        prodDialogRow.priceOverride && prodDialogRow.priceOverride !== ""
                          ? prodDialogRow.priceOverride
                          : prodDialogRow.price
                      )
                    : ""}
                </p>
                <DialogHeader>
                  <DialogTitle className="text-[20px] font-bold tracking-tight text-white">
                    {prodDialogRow?.name ?? ""}
                  </DialogTitle>
                </DialogHeader>
                {prodDialogFull && (() => {
                  const avail = calcProductAvailability(prodDialogFull, eventStockMap)
                  if (avail === null) return null
                  return (
                    <p className="mt-1 text-[13px] text-white/40">
                      {avail} {prodDialogFull?.saleType === "BOTTLE" ? "botellas" : "tragos"} disponibles
                    </p>
                  )
                })()}
              </div>

              {/* Ingredients */}
              <div className="flex-1 overflow-y-auto">
                {!prodDialogFull || prodDialogFull.recipes.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 px-6 py-10">
                    {prodDialogRow?.directStock != null ? (
                      <p className="text-center text-[28px] font-bold text-white">
                        {Math.round(Number.parseFloat(prodDialogRow.directStock)).toLocaleString("es-AR")}
                        <span className="ml-2 text-[16px] font-normal text-white/40">unidades</span>
                      </p>
                    ) : (
                      <p className="text-center text-[14px] text-white/30">Sin stock cargado</p>
                    )}
                    <button
                      type="button"
                      onClick={openDirectLoad}
                      className="mt-2 rounded-xl bg-[#FF9500]/10 px-5 py-2.5 text-[14px] font-semibold text-[#FF9500] transition-colors hover:bg-[#FF9500]/20"
                    >
                      Cargar stock
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {prodDialogFull.recipes.map((line) => {
                      const invRow = insumos.find((ins) => ins.id === line.inventoryItemId)
                      const stockVal = eventStockMap.get(line.inventoryItemId) ?? 0
                      const stockDisplay = invRow
                        ? formatStockWithUnit(invRow)
                        : `${stockVal.toLocaleString("es-AR")}`
                      const low = invRow ? isLowStock(invRow) : false
                      return (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => startStockLoad(line.inventoryItemId)}
                          className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-white/[0.03]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-white">
                              {line.inventoryItemName}
                            </p>
                            <p className="mt-0.5 text-[12px] text-white/35">
                              {(() => {
                                const qty = Number.parseFloat(line.quantityUsed).toLocaleString("es-AR")
                                const isBottle = prodDialogFull?.saleType === "BOTTLE"
                                const pkg = Number.parseFloat(line.inventoryPackageSize ?? "0")
                                if (isBottle && (line.inventoryBaseUnit === "ML" || line.inventoryBaseUnit === "GRAMS") && Number.isFinite(pkg) && pkg > 0) {
                                  return `${qty} botella(s) por venta`
                                }
                                const unitStr = line.inventoryBaseUnit === "ML" ? "ml" : line.inventoryBaseUnit === "GRAMS" ? "g" : "u."
                                return `${qty} ${unitStr} ${isBottle ? "por venta" : "por trago"}`
                              })()}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 text-[13px]",
                              low ? "text-[#FF9500]" : "text-white/40"
                            )}
                          >
                            {stockDisplay}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.06] bg-black/40 px-6 py-4">
                <button
                  type="button"
                  onClick={() => prodDialogRow && openEditorFromDialog(prodDialogRow)}
                  className="text-[13px] text-white/35 transition-colors hover:text-white/60"
                >
                  Editar producto
                </button>
              </div>
            </>
          ) : prodDialogStep === "direct-load" ? (
            /* Direct stock loading form (products without recipes) */
            <form onSubmit={submitDirectLoad} className="flex flex-col overflow-y-auto">
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setProdDialogStep("ingredients")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
                    {prodDialogRow?.name ?? "Cargar stock"}
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="flex flex-col items-center gap-4 px-8 py-10">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={directCount}
                  onChange={(e) => setDirectCount(e.target.value)}
                  className="h-20 w-full rounded-2xl border-white/[0.1] bg-white/[0.05] text-center text-[40px] font-bold tracking-tight text-white focus-visible:border-white/20 focus-visible:ring-0"
                  autoFocus
                  required
                />
                <p className="text-center text-[13px] text-white/40">
                  {(() => {
                    const n = Number.parseInt(directCount, 10)
                    if (!Number.isFinite(n) || n <= 0) return "Ingresá cuántas unidades sumás."
                    return `Sumás ${n.toLocaleString("es-AR")} unidades al stock del evento.`
                  })()}
                </p>
              </div>

              <div className="space-y-3 border-t border-white/[0.06] px-8 py-5">
                <p className="text-[12px] font-medium uppercase tracking-wider text-white/25">Costo (opcional)</p>
                <div className="flex gap-2">
                  <div className="flex flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                    {(["TOTAL", "UNIT"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDirectCostType(type)}
                        className={cn(
                          "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all",
                          directCostType === type
                            ? "bg-white/[0.1] text-white"
                            : "text-white/35 hover:text-white/55"
                        )}
                      >
                        {type === "TOTAL" ? "Total" : "Por unidad"}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="ARS"
                    value={directCostAmount}
                    onChange={(e) => setDirectCostAmount(e.target.value)}
                    className={cn(inputClass, "h-10 w-28 font-mono text-[13px]")}
                  />
                </div>
                {(() => {
                  const n = Number.parseInt(directCount, 10)
                  const raw = directCostAmount.trim().replace(",", ".")
                  const c = raw === "" ? NaN : Number.parseFloat(raw)
                  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(c) || c <= 0) return null
                  const total = directCostType === "UNIT" ? c * n : c
                  return (
                    <p className="text-[13px] text-white/50">
                      Gasto total: {formatMoneyArs(total.toFixed(2))}
                    </p>
                  )
                })()}
              </div>

              <div className="border-t border-white/[0.06] bg-black/40 px-5 py-4">
                <Button
                  type="submit"
                  disabled={directSaving}
                  className="h-12 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white"
                >
                  {directSaving ? "Sumando…" : "Sumar al stock"}
                </Button>
              </div>
            </form>
          ) : (
            /* Bottle loading form (recipe-based products) */
            <form onSubmit={submitBottleLoad} className="flex flex-col overflow-y-auto">
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setProdDialogStep("ingredients")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
                    {bottleTarget?.name ?? "Cargar stock"}
                  </DialogTitle>
                </DialogHeader>
              </div>

              <div className="flex flex-col items-center gap-4 px-8 py-10">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={bottleCount}
                  onChange={(e) => setBottleCount(e.target.value)}
                  className="h-20 w-full rounded-2xl border-white/[0.1] bg-white/[0.05] text-center text-[40px] font-bold tracking-tight text-white focus-visible:border-white/20 focus-visible:ring-0"
                  autoFocus
                  required
                />
                {bottleTarget ? (
                  <p className="text-center text-[13px] text-white/40">
                    {bottleLoadPreview(bottleTarget, Number.parseInt(bottleCount, 10) || 0)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-white/[0.06] px-8 py-5">
                <p className="text-[12px] font-medium uppercase tracking-wider text-white/25">Costo (opcional)</p>
                <div className="flex gap-2">
                  <div className="flex flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                    {(["TOTAL", "UNIT"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBottleCostType(type)}
                        className={cn(
                          "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-all",
                          bottleCostType === type
                            ? "bg-white/[0.1] text-white"
                            : "text-white/35 hover:text-white/55"
                        )}
                      >
                        {type === "TOTAL" ? "Total" : "Por botella"}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="ARS"
                    value={bottleCostAmount}
                    onChange={(e) => setBottleCostAmount(e.target.value)}
                    className={cn(inputClass, "h-10 w-28 font-mono text-[13px]")}
                  />
                </div>
                {(() => {
                  const n = Number.parseInt(bottleCount, 10)
                  const raw = bottleCostAmount.trim().replace(",", ".")
                  const c = raw === "" ? NaN : Number.parseFloat(raw)
                  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(c) || c <= 0) return null
                  const total = bottleCostType === "UNIT" ? c * n : c
                  return (
                    <p className="text-[13px] text-white/50">
                      Gasto total: {formatMoneyArs(total.toFixed(2))}
                    </p>
                  )
                })()}
              </div>

              <div className="border-t border-white/[0.06] bg-black/40 px-5 py-4">
                <Button
                  type="submit"
                  disabled={bottleSaving || !bottleItemId}
                  className="h-12 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white"
                >
                  {bottleSaving ? "Sumando…" : "Sumar al stock"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
