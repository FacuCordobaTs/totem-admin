import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventMenuProductRow,
  EventMenuProductsResponse,
} from "@/types/event-dashboard"
import type { ApiProduct, ApiProductCategory } from "@/components/inventory/recipe-config"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import { EventBarsTab } from "@/components/events/event-bars-tab"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
type CategoriesApi = { categories: ApiProductCategory[] }
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
  const [categories, setCategories] = useState<ApiProductCategory[]>([])
  const [insumos, setInsumos] = useState<EventInvRow[]>([])
  const [loading, setLoading] = useState(true)

  // Menu inline editing
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Product editor (create / edit)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProduct, setEditorProduct] = useState<ApiProduct | null>(null)
  const [editorOverride, setEditorOverride] = useState<string | null>(null)

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return
      if (!opts?.silent) setLoading(true)
      try {
        const [menuRes, productsRes, materialsRes, categoriesRes, invRes] = await Promise.all([
          apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, { method: "GET", token }),
          apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
          apiFetch<MaterialsApi>("/inventory/items", { method: "GET", token }),
          apiFetch<CategoriesApi>("/inventory/categories", { method: "GET", token }),
          apiFetch<EventInventoryListResponse>(`/events/${eventId}/inventory`, { method: "GET", token }),
        ])
        setMenuRows(menuRes.products)
        setCatalogProducts(productsRes.products)
        setMaterials(materialsRes.items)
        setCategories(categoriesRes.categories)
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

  function openCreate() {
    setEditorProduct(null)
    setEditorOverride(null)
    setEditorOpen(true)
  }

  function openEdit(row: EventMenuProductRow) {
    setEditorProduct(catalogById.get(row.id) ?? null)
    setEditorOverride(row.priceOverride ?? null)
    setEditorOpen(true)
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
      {/* ── Bloque A: Menú del evento ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-semibold text-white">Menú del evento</h3>
            {menuRows.length > 0 ? (
              <p className="mt-0.5 text-[13px] text-white/35">
                Prendé lo que se vende. Tocá el precio para uno especial.
              </p>
            ) : null}
          </div>
          {menuRows.length > 0 ? (
            <Button
              type="button"
              onClick={openCreate}
              className="h-8 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 active:opacity-70"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo producto
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
            categories={categories}
            onCategoriesChanged={() => void loadAll({ silent: true })}
            token={token}
            onSaved={() => void loadAll({ silent: true })}
          />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {menuRows.map((row) => {
              const full = catalogById.get(row.id) ?? null
              const availability =
                full && full.recipes.length > 0
                  ? calcProductAvailability(full, eventStockMap)
                  : null
              const hasOverride = row.priceOverride != null && row.priceOverride !== ""
              const draft = priceDraft[row.id]
              const priceValue =
                draft != null
                  ? draft
                  : hasOverride
                    ? String(Number.parseFloat(row.priceOverride!))
                    : ""
              return (
                <div key={row.id} className="flex items-center gap-3 py-3">
                  <Switch
                    checked={row.isActiveForEvent}
                    onCheckedChange={(v) => void toggleMenu(row.id, v)}
                    disabled={togglingId === row.id}
                    className="scale-90"
                  />
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
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

                  {row.isActiveForEvent ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={priceValue}
                        placeholder={String(Number.parseFloat(row.price))}
                        onChange={(e) =>
                          setPriceDraft((d) => ({ ...d, [row.id]: e.target.value }))
                        }
                        onBlur={() => void persistOverride(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        }}
                        className={cn(
                          inputClass,
                          "w-24 text-right font-mono",
                          hasOverride ? "text-[#FF9500]" : "text-white"
                        )}
                        aria-label={`Precio de evento de ${row.name}`}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Bloque B: Stock ───────────────────────────────────────── */}
      <StockBlock
        eventId={eventId}
        insumos={insumos}
        activeGlassProducts={activeGlassProducts}
        onChanged={() => {
          onLogisticsChange?.()
          void loadAll({ silent: true })
        }}
      />

      {/* ── Bloque C: Puestos ─────────────────────────────────────── */}
      <EventBarsTab eventId={eventId} puestosMode />

      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editorProduct}
        priceOverride={editorOverride}
        eventId={eventId}
        materials={materials}
        categories={categories}
        onCategoriesChanged={() => void loadAll({ silent: true })}
        token={token}
        onSaved={() => void loadAll({ silent: true })}
        onRemovedFromMenu={() => void loadAll({ silent: true })}
        onDeletedFromCatalog={() => void loadAll({ silent: true })}
      />
    </div>
  )
}

/** Bloque B — Stock de insumos contables (tenés / entra) con carga por compra. */
function StockBlock({
  eventId,
  insumos,
  activeGlassProducts,
  onChanged,
}: {
  eventId: string
  insumos: EventInvRow[]
  activeGlassProducts: ApiProduct[]
  onChanged: () => void
}) {
  const token = useAuthStore((s) => s.token)

  // inline compra per-insumo
  const [openId, setOpenId] = useState<string | null>(null)
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [saving, setSaving] = useState(false)

  // new insumo compra
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUnit, setNewUnit] = useState("botella")
  const [newQty, setNewQty] = useState("")
  const [newCost, setNewCost] = useState("")

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
      setNewOpen(false)
      setNewName("")
      setNewQty("")
      setNewCost("")
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

  function submitNew() {
    const name = newName.trim()
    if (!name) {
      toast.error("Poné el nombre del insumo")
      return
    }
    const q = Number.parseFloat(newQty.replace(",", "."))
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Ingresá la cantidad")
      return
    }
    const c = newCost.trim().replace(",", ".")
    const body: Record<string, unknown> = {
      itemName: name,
      countingUnit: newUnit.trim() || "unidad",
      quantity: q,
    }
    if (c !== "") body.totalCost = Number.parseFloat(c)
    void submitPurchase(body)
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
          onClick={() => setNewOpen((v) => !v)}
          className="h-8 gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/70 hover:bg-white/[0.08] active:opacity-70"
        >
          <Plus className="h-3.5 w-3.5" />
          Comprar mercadería
        </Button>
      </div>

      {newOpen ? (
        <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Insumo (ej. Fernet)"
              className={inputClass}
              autoFocus
            />
            <Input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="botella"
              className={cn(inputClass, "sm:w-28")}
              aria-label="Unidad contable"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Cantidad"
              className={cn(inputClass, "flex-1")}
            />
            <span className="text-[13px] text-white/30">—</span>
            <Input
              type="text"
              inputMode="decimal"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              placeholder="$ total (opcional)"
              className={cn(inputClass, "flex-1 font-mono")}
            />
            <Button
              type="button"
              disabled={saving}
              onClick={submitNew}
              className="h-9 shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/70 hover:bg-white/[0.08]"
            >
              {saving ? "…" : "Registrar"}
            </Button>
          </div>
          <p className="text-[12px] text-white/30">
            {newName.trim()
              ? `${newQty || "—"} ${newUnit.trim() || "unidad"}s de ${newName.trim()}${
                  newCost.trim() ? ` por ${money(newCost.replace(",", "."))}` : ""
                }.`
              : "El insumo nace la primera vez que lo comprás."}
          </p>
        </div>
      ) : null}

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
