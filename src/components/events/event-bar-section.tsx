import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventMenuProductRow,
  EventMenuProductsResponse,
} from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import { EventBarsTab } from "@/components/events/event-bars-tab"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const inputClass =
  "h-9 rounded-lg border-white/[0.1] bg-white/[0.05] px-3 text-[14px] transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

type EventInvRow = {
  id: string
  name: string
  baseUnit: ApiInventoryItem["baseUnit"]
  packageSize: string
  eventInventoryId: string | null
  stockAllocated: string
}

type EventInventoryListResponse = { items: EventInvRow[] }
type ProductsApi = { products: ApiProduct[] }
type MaterialsApi = { items: ApiInventoryItem[] }

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

/** Base-unit consumption per single sale of the product for a given recipe line. */
function perSaleBaseUnits(product: ApiProduct, line: ApiProduct["recipes"][number]): number {
  let qty = Number.parseFloat(line.quantityUsed)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  // BOTTLE products declare recipe in envases; stock is in base units (ml/g) → × packageSize.
  if (
    product.saleType === "BOTTLE" &&
    (line.inventoryBaseUnit === "ML" || line.inventoryBaseUnit === "GRAMS")
  ) {
    const pkg = Number.parseFloat(line.inventoryPackageSize ?? "0")
    if (Number.isFinite(pkg) && pkg > 0) qty = qty * pkg
  }
  return qty
}

/** How many units of `product` the current event stock supports (min over its recipe). */
function calcProductAvailability(
  product: ApiProduct,
  eventStockMap: Map<string, number>
): number | null {
  if (!product.recipes || product.recipes.length === 0) return null
  let min = Infinity
  for (const line of product.recipes) {
    const per = perSaleBaseUnits(product, line)
    if (per <= 0) continue
    const stock = eventStockMap.get(line.inventoryItemId) ?? 0
    min = Math.min(min, Math.floor(stock / per))
  }
  return min === Infinity ? null : Math.max(0, min)
}

/**
 * Silent derived reading for an insumo: "alcanza para ~N tragos", based on the first
 * GLASS product that consumes it. Botella-sold insumos read fine as countable "tenés".
 */
function insumoServings(
  insumo: EventInvRow,
  activeGlassProducts: ApiProduct[]
): number | null {
  const stock = Number.parseFloat(insumo.stockAllocated)
  if (!Number.isFinite(stock) || stock <= 0) return null
  for (const p of activeGlassProducts) {
    const line = p.recipes.find((r) => r.inventoryItemId === insumo.id)
    if (!line) continue
    const per = perSaleBaseUnits(p, line)
    if (per <= 0) continue
    return Math.max(0, Math.floor(stock / per))
  }
  return null
}

function countableStock(insumo: EventInvRow): string {
  if (hasBottlePackage(insumo)) {
    const bottles = stockBaseToBottleDraft(insumo.stockAllocated, insumo.packageSize)
    const n = Number.parseFloat(bottles)
    return Number.isNaN(n) ? "0" : Math.round(n).toLocaleString("es-AR")
  }
  const n = Number.parseFloat(insumo.stockAllocated)
  return Number.isNaN(n) ? "0" : Math.round(n).toLocaleString("es-AR")
}

type Props = {
  eventId: string
  onLogisticsChange?: () => void
}

export function EventBarSection({ eventId, onLogisticsChange }: Props) {
  const token = useAuthStore((s) => s.token)

  const [menuRows, setMenuRows] = useState<EventMenuProductRow[]>([])
  const [catalogProducts, setCatalogProducts] = useState<ApiProduct[]>([])
  const [materials, setMaterials] = useState<ApiInventoryItem[]>([])
  const [insumos, setInsumos] = useState<EventInvRow[]>([])
  const [loading, setLoading] = useState(true)

  // Menu inline editing
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [menuConfigOpen, setMenuConfigOpen] = useState(false)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)


  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return
      if (!opts?.silent) setLoading(true)
      try {
        const [menuRes, productsRes, materialsRes, invRes] = await Promise.all([
          apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token }),
          apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
          apiFetch<MaterialsApi>("/inventory/items", { method: "GET", token }),
          apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token }),
        ])
        setMenuRows(menuRes.products)
        setCatalogProducts(productsRes.products)
        setMaterials(materialsRes.items)
        setInsumos(invRes.items)
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la barra")
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [token, eventId]
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const catalogById = useMemo(
    () => new Map(catalogProducts.map((p) => [p.id, p])),
    [catalogProducts]
  )

  const eventStockMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const ins of insumos) {
      const n = Number.parseFloat(ins.stockAllocated)
      if (Number.isFinite(n)) map.set(ins.id, n)
    }
    return map
  }, [insumos])

  const activeGlassProducts = useMemo(
    () =>
      catalogProducts.filter(
        (p) =>
          (p.saleType ?? "GLASS") === "GLASS" &&
          p.recipes.length > 0 &&
          menuRows.some((m) => m.id === p.id && m.isActiveForEvent)
      ),
    [catalogProducts, menuRows]
  )
  const activeMenuRows = useMemo(
    () => menuRows.filter((row) => row.isActiveForEvent),
    [menuRows]
  )

  async function toggleMenu(productId: string, next: boolean) {
    if (!token || togglingId) return
    setTogglingId(productId)
    // optimistic
    setMenuRows((rows) =>
      rows.map((r) => (r.id === productId ? { ...r, isActiveForEvent: next } : r))
    )
    try {
      await apiFetch(`/events/${eventId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId, isActive: next }),
      })
      onLogisticsChange?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el menú")
      await loadAll({ silent: true })
    } finally {
      setTogglingId(null)
    }
  }

  async function persistOverride(row: EventMenuProductRow) {
    if (!token) return
    const raw = (priceDraft[row.id] ?? "").trim().replace(",", ".")
    if (priceDraft[row.id] == null) return // nunca se editó
    // Empty draft → clear override (hereda el precio base).
    const nextValue = raw === "" ? null : raw
    if (nextValue !== null) {
      const n = Number.parseFloat(nextValue)
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Precio inválido")
        return
      }
    }
    // no-op guard: compará contra el override actual normalizado.
    const currentNorm =
      row.priceOverride == null || row.priceOverride === ""
        ? null
        : String(Number.parseFloat(row.priceOverride))
    const nextNorm = nextValue === null ? null : String(Number.parseFloat(nextValue))
    if (currentNorm === nextNorm) {
      setPriceDraft((d) => {
        const { [row.id]: _, ...rest } = d
        return rest
      })
      return
    }
    try {
      await apiFetch(`/events/${eventId}/products/set-override`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ productId: row.id, priceOverride: nextValue }),
      })
      setMenuRows((rows) =>
        rows.map((r) => (r.id === row.id ? { ...r, priceOverride: nextValue } : r))
      )
      setPriceDraft((d) => {
        const { [row.id]: _, ...rest } = d
        return rest
      })
      onLogisticsChange?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el precio")
    }
  }

  if (loading) {
    return (
      <div className="space-y-10">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* ── Bloque A: Barras ──────────────────────────────────────── */}
      <EventBarsTab eventId={eventId} embedded />

      {/* ── Bloque A: Menú del evento ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-semibold text-white">Menú del evento</h3>
            <p className="mt-0.5 text-[13px] text-white/35">Productos activos y precio de venta del evento.</p>
          </div>
          {menuRows.length > 0 ? (
            <Button
              type="button"
              onClick={() => setMenuConfigOpen(true)}
              className="h-8 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 active:opacity-70"
            >
              <Plus className="h-3.5 w-3.5" />
              Configurar menú
            </Button>
          ) : null}
        </div>

        {menuRows.length === 0 ? (
          <ProductEditorDialog
            embedded
            open
            onOpenChange={() => {}}
            product={null}
            eventId={eventId}
            materials={materials}
            token={token}
            onSaved={() => void loadAll({ silent: true })}
          />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {activeMenuRows.map((row) => {
              const full = catalogById.get(row.id) ?? null
              const availability =
                full && full.recipes.length > 0
                  ? calcProductAvailability(full, eventStockMap)
                  : null
              return (
                <div key={row.id} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => setMenuConfigOpen(true)}
                    className={cn(
                      "min-w-0 flex-1 text-left",
                      row.isActiveForEvent ? "" : "opacity-45"
                    )}
                  >
                    <p className="truncate text-[15px] font-medium text-white">{row.name}</p>
                    <p className="text-[12px] text-white/35">Base {money(row.price)}</p>
                  </button>

                  {availability !== null && row.isActiveForEvent ? (
                    <span className="shrink-0 text-[12px] text-white/30">
                      ~{availability.toLocaleString("es-AR")}{" "}
                      {(full?.saleType ?? "GLASS") === "BOTTLE" ? "botellas" : "tragos"}
                    </span>
                  ) : null}

                  <span className="shrink-0 text-sm font-semibold text-[#FF9500]">{money(row.priceOverride ?? row.price)}</span>
                </div>
              )
            })}
          </div>
        )}
        <Dialog open={menuConfigOpen} onOpenChange={setMenuConfigOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border-white/[0.1] bg-black p-0 text-white">
            <DialogHeader className="border-b border-white/[0.06] px-5 py-5 text-left"><DialogTitle className="text-xl text-white">Configurar menú</DialogTitle><DialogDescription className="text-sm text-white/45">Activá productos y configurá su precio para este evento.</DialogDescription></DialogHeader>
            <div className="space-y-5 p-5">
              {[{ title: "Activos para el evento", rows: menuRows.filter((r) => r.isActiveForEvent) }, { title: "No activos para el evento", rows: menuRows.filter((r) => !r.isActiveForEvent) }].map((group) => <div key={group.title}><p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/35">{group.title}</p><div className="overflow-hidden rounded-xl border border-white/[0.07]">{group.rows.map((row) => { const open = editingPriceId === row.id; const value = priceDraft[row.id] ?? (row.priceOverride != null ? String(Number.parseFloat(row.priceOverride)) : ""); return <div key={row.id} onClick={() => void toggleMenu(row.id, !row.isActiveForEvent)} className="cursor-pointer border-b border-white/[0.05] px-3 py-2.5 last:border-0 hover:bg-white/[0.04]"><div className="flex items-center gap-3"><input type="checkbox" checked={row.isActiveForEvent} readOnly className="pointer-events-none accent-[#FF9500]" /><span className="min-w-0 flex-1 truncate text-sm text-white/80">{row.name}</span><span className="text-sm text-[#FF9500]">{money(row.priceOverride ?? row.price)}</span><Button type="button" variant="outline" onClick={(e) => { e.stopPropagation(); setEditingPriceId(open ? null : row.id) }} className="h-8 border-white/[0.12] bg-transparent px-2.5 text-xs text-white/70">Cambiar precio</Button></div>{open ? <div className="mt-2 flex gap-2 pl-10" onClick={(e) => e.stopPropagation()}><Input autoFocus inputMode="decimal" value={value} placeholder={String(Number.parseFloat(row.price))} onChange={(e) => setPriceDraft((d) => ({ ...d, [row.id]: e.target.value }))} className="h-9 max-w-36 border-white/[0.1] bg-white/[0.04] text-sm" /><Button type="button" onClick={() => { void persistOverride(row); setEditingPriceId(null) }} className="h-9 bg-[#FF9500] text-xs text-white">Guardar</Button></div> : null}</div> })}</div></div>)}
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* ── Bloque C: Stock ───────────────────────────────────────── */}
      <StockBlock
        eventId={eventId}
        insumos={insumos}
        activeGlassProducts={activeGlassProducts}
        catalogProducts={catalogProducts}
        materials={materials}
        onChanged={() => {
          onLogisticsChange?.()
          void loadAll({ silent: true })
        }}
      />

    </div>
  )
}

/** Bloque B — Stock de insumos contables (tenés / entra) con carga por compra. */
function StockBlock({
  eventId,
  insumos,
  activeGlassProducts,
  catalogProducts,
  materials,
  onChanged,
}: {
  eventId: string
  insumos: EventInvRow[]
  activeGlassProducts: ApiProduct[]
  catalogProducts: ApiProduct[]
  materials: ApiInventoryItem[]
  onChanged: () => void
}) {
  const token = useAuthStore((s) => s.token)

  // inline compra per-insumo
  const [openId, setOpenId] = useState<string | null>(null)
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [saving, setSaving] = useState(false)

  // Compra guiada: primero se eligen los productos, después el insumo que se les asigna.
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [purchaseProductIds, setPurchaseProductIds] = useState<string[]>([])
  const [purchaseName, setPurchaseName] = useState("")
  const [purchaseQty, setPurchaseQty] = useState("")
  const [purchaseCost, setPurchaseCost] = useState("")
  const [recipeAmounts, setRecipeAmounts] = useState<Record<string, string>>({})

  function resetInline() {
    setOpenId(null)
    setQty("")
    setCost("")
  }

  async function submitPurchase(body: Record<string, unknown>) {
    if (!token) return
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/purchases`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      toast.success("Compra registrada")
      resetInline()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar la compra")
    } finally {
      setSaving(false)
    }
  }

  function submitInline(insumo: EventInvRow) {
    const q = Number.parseFloat(qty.replace(",", "."))
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Ingresá la cantidad que entra")
      return
    }
    const c = cost.trim().replace(",", ".")
    const body: Record<string, unknown> = {
      inventoryItemId: insumo.id,
      quantity: q,
    }
    if (c !== "") body.totalCost = Number.parseFloat(c)
    void submitPurchase(body)
  }

  function closePurchase() {
    if (saving) return
    setPurchaseOpen(false)
    setPurchaseProductIds([])
    setPurchaseName("")
    setPurchaseQty("")
    setPurchaseCost("")
    setRecipeAmounts({})
  }

  function togglePurchaseProduct(productId: string) {
    setPurchaseProductIds((ids) =>
      ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId]
    )
  }

  const purchaseMaterial = useMemo(
    () => materials.find((m) => m.name.trim().toLowerCase() === purchaseName.trim().toLowerCase()),
    [materials, purchaseName]
  )
  const selectedPurchaseProducts = useMemo(
    () => catalogProducts.filter((p) => purchaseProductIds.includes(p.id)),
    [catalogProducts, purchaseProductIds]
  )
  const productsNeedingRecipe = useMemo(
    () =>
      purchaseName.trim()
        ? selectedPurchaseProducts.filter(
            (p) => !purchaseMaterial || !p.recipes.some((r) => r.inventoryItemId === purchaseMaterial.id)
          )
        : [],
    [purchaseMaterial, purchaseName, selectedPurchaseProducts]
  )

  async function submitGuidedPurchase() {
    const name = purchaseName.trim()
    if (!name) {
      toast.error("Poné el nombre del insumo")
      return
    }
    if (selectedPurchaseProducts.length === 0) {
      toast.error("Elegí al menos un producto para este insumo")
      return
    }
    const q = Number.parseFloat(purchaseQty.replace(",", "."))
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Ingresá la cantidad")
      return
    }
    for (const product of productsNeedingRecipe) {
      const amount = Number.parseFloat((recipeAmounts[product.id] ?? "").replace(",", "."))
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(
          product.saleType === "BOTTLE"
            ? `Indicá cuántos envases consume ${product.name}`
            : `Indicá cuántos tragos rinde ${name} para ${product.name}`
        )
        return
      }
    }

    setSaving(true)
    try {
      // Si el insumo es nuevo lo creamos antes de la compra para poder asociarlo a las recetas.
      let item = purchaseMaterial
      if (!item) {
        const res = await apiFetch<{ item: ApiInventoryItem }>("/inventory/items", {
          method: "POST",
          token,
          body: JSON.stringify({ name, baseUnit: "UNIT", countingUnit: "envase" }),
        })
        item = res.item
      }

      // PUT conserva la receta existente y agrega únicamente esta relación producto ↔ insumo.
      for (const product of productsNeedingRecipe) {
        const amount = (recipeAmounts[product.id] ?? "").trim().replace(",", ".")
        await apiFetch(`/inventory/products/${product.id}`, {
          method: "PUT",
          token,
          body: JSON.stringify({
            name: product.name,
            price: product.price,
            saleType: product.saleType ?? "GLASS",
            categoryId: product.categoryId ?? null,
            recipes: [
              ...product.recipes.map((r) => ({
                inventoryItemId: r.inventoryItemId,
                quantityUsed: r.quantityUsed,
              })),
              (product.saleType ?? "GLASS") === "BOTTLE"
                ? { inventoryItemId: item.id, quantityUsed: amount }
                : { inventoryItemId: item.id, yieldPerPackage: amount },
            ],
          }),
        })
      }

      const c = purchaseCost.trim().replace(",", ".")
      const body: Record<string, unknown> = { inventoryItemId: item.id, quantity: q }
      if (c !== "") body.totalCost = Number.parseFloat(c)
      await apiFetch(`/events/${eventId}/purchases`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      toast.success("Compra registrada y receta actualizada")
      closePurchase()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar la compra")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold text-white">Stock</h3>
          <p className="mt-0.5 text-[13px] text-white/35">Cargá lo que comprás.</p>
        </div>
        <Button
          type="button"
          onClick={() => setPurchaseOpen(true)}
          className="h-8 gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/70 hover:bg-white/[0.08] active:opacity-70"
        >
          <Plus className="h-3.5 w-3.5" />
          Comprar mercadería
        </Button>
      </div>

      <Dialog open={purchaseOpen} onOpenChange={(open) => (open ? setPurchaseOpen(true) : closePurchase())}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto rounded-2xl border-white/[0.1] bg-black p-0 text-white">
          <DialogHeader className="border-b border-white/[0.06] px-5 py-5 text-left">
            <DialogTitle className="text-xl text-white">Comprar mercadería</DialogTitle>
            <DialogDescription className="text-sm text-white/45">Elegí a qué productos pertenece el insumo. Podés asignarlo a varios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">Productos</p>
              <div className="max-h-44 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.08]">
                {catalogProducts.map((product) => {
                  const checked = purchaseProductIds.includes(product.id)
                  return <label key={product.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04]"><input type="checkbox" checked={checked} onChange={() => togglePurchaseProduct(product.id)} className="accent-[#FF9500]" /><span className="min-w-0 flex-1 truncate text-sm text-white/85">{product.name}</span><span className="text-xs text-white/35">{(product.saleType ?? "GLASS") === "BOTTLE" ? "Botella" : "Trago"}</span></label>
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input autoFocus value={purchaseName} onChange={(e) => setPurchaseName(e.target.value)} placeholder="Insumo (ej. Fernet)" className={inputClass} />
              <Input type="text" inputMode="decimal" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} placeholder="Cantidad" className={inputClass} />
              <Input type="text" inputMode="decimal" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="$ total (opcional)" className={cn(inputClass, "font-mono sm:col-span-2")} />
            </div>
            {productsNeedingRecipe.length > 0 ? <div className="space-y-3 rounded-xl border border-[#FF9500]/20 bg-[#FF9500]/[0.06] p-3"><p className="text-sm font-medium text-white">Asignar a la receta</p><p className="text-xs text-white/45">Estos productos todavía no usan este insumo.</p>{productsNeedingRecipe.map((product) => { const bottle = (product.saleType ?? "GLASS") === "BOTTLE"; return <div key={product.id}><label className="mb-1 block text-xs text-white/60">{product.name} · {bottle ? `¿Cuántos envases de ${purchaseName.trim() || "este insumo"} consume por producto?` : `¿Cuántos tragos de ${product.name} rinde un envase?`}</label><Input type="text" inputMode="decimal" value={recipeAmounts[product.id] ?? ""} onChange={(e) => setRecipeAmounts((v) => ({ ...v, [product.id]: e.target.value }))} placeholder={bottle ? "Ej. 2" : "Ej. 20"} className={inputClass} /></div> })}</div> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={closePurchase} className="text-white/60">Cancelar</Button><Button type="button" disabled={saving} onClick={() => void submitGuidedPurchase()} className="bg-[#FF9500] text-white hover:bg-[#FF9500]/90">{saving ? "Registrando…" : "Registrar compra"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {insumos.length === 0 ? (
        <p className="py-6 text-[14px] text-white/30">
          Todavía no cargaste stock. Registrá tu primera compra.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {/* encabezado tenés / entra */}
          <div className="flex items-center gap-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/25">
            <span className="min-w-0 flex-1">Insumo</span>
            <span className="w-24 text-right">Tenés</span>
            <span className="w-20 text-right">Entra</span>
          </div>
          {insumos.map((insumo) => {
            const servings = insumoServings(insumo, activeGlassProducts)
            const isOpen = openId === insumo.id
            return (
              <div key={insumo.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-white">{insumo.name}</p>
                    {servings !== null ? (
                      <p className="text-[12px] text-white/30">
                        alcanza para ~{servings.toLocaleString("es-AR")} tragos
                      </p>
                    ) : null}
                  </div>
                  <span className="w-24 text-right text-[15px] font-semibold tabular-nums text-white">
                    {countableStock(insumo)}
                  </span>
                  <div className="w-20 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (isOpen) resetInline()
                        else {
                          setOpenId(insumo.id)
                          setQty("")
                          setCost("")
                        }
                      }}
                      className="text-[13px] font-medium text-white/55 hover:text-white/90"
                    >
                      {isOpen ? "Cerrar" : "+ Comprar"}
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="mt-2.5 flex items-center gap-2 pl-0">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder="Cantidad"
                      className={cn(inputClass, "flex-1")}
                      autoFocus
                    />
                    <span className="text-[13px] text-white/30">—</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="$ total (opcional)"
                      className={cn(inputClass, "flex-1 font-mono")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitInline(insumo)
                      }}
                    />
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => submitInline(insumo)}
                      className="h-9 shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/70 hover:bg-white/[0.08]"
                    >
                      {saving ? "…" : "Sumar"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
