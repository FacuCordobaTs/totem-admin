import { useEffect, useState } from "react"
import { toast } from "sonner"
import { X, Plus } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RecipeIngredientRow } from "@/components/inventory/recipe-ingredient-row"
import { ProductImageUploader } from "@/components/inventory/product-image-uploader"
import {
  draftLineQuantityForApi,
  materialSupportsFullBottle,
  recipeApiLineToDraft,
  type ProductSaleType,
  type RecipeDraftLine,
} from "@/lib/inventory-recipe-helpers"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import { cn } from "@/lib/utils"

const SALE_TYPE_OPTIONS: { value: ProductSaleType; label: string; desc: string }[] = [
  {
    value: "GLASS",
    label: "Por unidad / trago",
    desc: "Cada venta descuenta una cantidad fija de uno o más insumos según la receta.",
  },
  {
    value: "BOTTLE",
    label: "Botella entera",
    desc: "Cada venta descuenta un envase completo del insumo.",
  },
]

const inputClass =
  "h-12 rounded-xl border-white/[0.1] bg-white/[0.05] px-4 text-[15px] text-white placeholder:text-white/20 focus-visible:border-white/20 focus-visible:ring-0"

function lineIsSavable(
  l: RecipeDraftLine,
  materials: ApiInventoryItem[],
  saleType: ProductSaleType
): boolean {
  if (!l.inventoryItemId) return false
  const mat = materials.find((m) => m.id === l.inventoryItemId)
  if (l.useFullBottle && materialSupportsFullBottle(mat, saleType)) return true
  const q = Number.parseFloat(l.quantityUsed.replace(",", "."))
  return Number.isFinite(q) && q > 0
}

export type ProductEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create mode */
  product: ApiProduct | null
  /** Current event-specific price override (only relevant when eventId is set) */
  priceOverride?: string | null
  /** If set, shows event-specific fields and actions */
  eventId?: string
  materials: ApiInventoryItem[]
  token: string | null
  onSaved: () => void
  /** Called after removing product from event menu */
  onRemovedFromMenu?: () => void
  /** Called after deactivating product from catalog */
  onDeletedFromCatalog?: () => void
}

export function ProductEditorDialog({
  open,
  onOpenChange,
  product,
  priceOverride,
  eventId,
  materials,
  token,
  onSaved,
  onRemovedFromMenu,
  onDeletedFromCatalog,
}: ProductEditorDialogProps) {
  const isCreate = product === null

  const [name, setName] = useState("")
  const [basePrice, setBasePrice] = useState("")
  const [eventPrice, setEventPrice] = useState("")
  const [saleType, setSaleType] = useState<ProductSaleType>("GLASS")
  const [recipeDraftLines, setRecipeDraftLines] = useState<RecipeDraftLine[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    if (!open) return
    setDeleteConfirm(false)
    if (product) {
      setName(product.name)
      setBasePrice(product.price)
      setEventPrice(priceOverride ?? "")
      setSaleType(product.saleType ?? "GLASS")
      setRecipeDraftLines(
        (product.recipes ?? []).map((r) =>
          recipeApiLineToDraft(r, materials.find((m) => m.id === r.inventoryItemId))
        )
      )
    } else {
      setName("")
      setBasePrice("")
      setEventPrice("")
      setSaleType("GLASS")
      setRecipeDraftLines([])
    }
  }, [open, product, priceOverride, materials])

  function addLine() {
    const first = materials[0]?.id
    if (!first) {
      toast.message("Agregá al menos un insumo al catálogo primero")
      return
    }
    setRecipeDraftLines((prev) => [
      ...prev,
      { inventoryItemId: first, quantityUsed: "1", useFullBottle: false },
    ])
  }

  async function handleSave() {
    if (!token || !name.trim() || !basePrice.trim()) return
    setSaving(true)
    try {
      const recipes = recipeDraftLines
        .filter((l) => lineIsSavable(l, materials, saleType))
        .map((l) => ({
          inventoryItemId: l.inventoryItemId,
          quantityUsed: draftLineQuantityForApi(
            l,
            materials.find((m) => m.id === l.inventoryItemId)
          ),
        }))

      let productId: string

      if (isCreate) {
        const res = await apiFetch<{ product: ApiProduct }>("/inventory/products", {
          method: "POST",
          token,
          body: JSON.stringify({
            name: name.trim(),
            price: basePrice,
            saleType,
            recipes,
          }),
        })
        productId = res.product.id
        if (eventId) {
          await apiFetch(`/events/${eventId}/products/toggle`, {
            method: "POST",
            token,
            body: JSON.stringify({ productId, isActive: true }),
          })
        }
      } else {
        productId = product.id
        await apiFetch(`/inventory/products/${productId}`, {
          method: "PUT",
          token,
          body: JSON.stringify({
            name: name.trim(),
            price: basePrice,
            saleType,
            recipes,
          }),
        })
      }

      if (eventId) {
        const newOverride = eventPrice.trim() === "" ? null : eventPrice.trim()
        await apiFetch(`/events/${eventId}/products/set-override`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ productId, priceOverride: newOverride }),
        })
      }

      toast.success(isCreate ? "Producto creado" : "Producto guardado")
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveFromMenu() {
    if (!token || !product || !eventId) return
    try {
      await apiFetch(`/events/${eventId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: product.id, isActive: false }),
      })
      toast.success("Producto quitado del menú")
      onOpenChange(false)
      onRemovedFromMenu?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo quitar del menú")
    }
  }

  async function handleDeleteFromCatalog() {
    if (!token || !product) return
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setDeleteLoading(true)
    try {
      await apiFetch(`/inventory/products/${product.id}`, {
        method: "DELETE",
        token,
      })
      toast.success("Producto eliminado del catálogo")
      onOpenChange(false)
      onDeletedFromCatalog?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] p-0 sm:max-w-[720px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
            {isCreate ? "Nuevo producto" : "Editar producto"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-8 p-6">
            {/* Nombre */}
            <div className="space-y-2">
              <label className="text-[13px] text-white/45">Nombre</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Ej. Fernet con Coca"
                required
              />
            </div>

            {/* Precio base */}
            <div className="space-y-2">
              <label className="text-[13px] text-white/45">Precio base</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-white/30">
                  $
                </span>
                <Input
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className={cn(inputClass, "pl-8 font-mono")}
                  inputMode="decimal"
                  required
                />
              </div>
              <p className="text-[12px] text-white/25">
                Precio en el catálogo. Se usa si no definís un precio específico para el evento.
              </p>
            </div>

            {/* Precio para este evento */}
            {eventId ? (
              <div className="space-y-2">
                <label className="text-[13px] text-white/45">
                  Precio para este evento{" "}
                  <span className="text-white/20">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-white/30">
                    $
                  </span>
                  <Input
                    value={eventPrice}
                    onChange={(e) => setEventPrice(e.target.value)}
                    className={cn(inputClass, "pl-8 font-mono")}
                    inputMode="decimal"
                    placeholder="Usa precio base"
                  />
                </div>
                <p className="text-[12px] text-white/25">
                  Solo afecta este evento. Dejá vacío para usar el precio base.
                </p>
              </div>
            ) : null}

            {/* Tipo de venta */}
            <div className="space-y-3">
              <label className="text-[13px] text-white/45">Tipo de venta</label>
              <div className="space-y-2">
                {SALE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSaleType(opt.value)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3.5 text-left transition-colors",
                      saleType === opt.value
                        ? "border-[#FF9500]/50 bg-[#FF9500]/[0.08]"
                        : "border-white/[0.08] hover:border-white/[0.15]"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[14px] font-medium",
                        saleType === opt.value ? "text-[#FF9500]" : "text-white/80"
                      )}
                    >
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-white/30">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Receta */}
            <div className="space-y-4">
              <div>
                <p className="text-[15px] font-semibold text-white">Receta</p>
                <p className="mt-0.5 text-[13px] text-white/40">
                  Qué se descuenta del stock por cada venta.
                </p>
              </div>
              <div className="space-y-3">
                {recipeDraftLines.map((line, idx) => (
                  <RecipeIngredientRow
                    key={`${line.inventoryItemId}-${idx}`}
                    line={line}
                    index={idx}
                    materials={materials}
                    saleType={saleType}
                    selectTriggerClass="h-11 min-w-[160px] flex-1 rounded-xl border-white/[0.1] bg-white/[0.05] px-4 text-[15px] transition-all"
                    quantityInputClass="h-11 w-28 rounded-xl border-white/[0.1] bg-white/[0.05] text-center font-mono text-[15px]"
                    onChange={(i, patch) =>
                      setRecipeDraftLines((prev) =>
                        prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
                      )
                    }
                    onRemove={(i) =>
                      setRecipeDraftLines((prev) => prev.filter((_, j) => j !== i))
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1.5 text-[13px] text-white/35 transition-colors hover:text-white/60"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar insumo
              </button>
            </div>

            {/* Imagen */}
            {product && !isCreate ? (
              <div className="space-y-2">
                <label className="text-[13px] text-white/45">
                  Imagen{" "}
                  <span className="text-white/20">(tienda pública)</span>
                </label>
                <ProductImageUploader
                  product={{ id: product.id, name: product.name, imageUrl: product.imageUrl }}
                  onUpdated={onSaved}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              {!isCreate && eventId ? (
                <button
                  type="button"
                  onClick={() => void handleRemoveFromMenu()}
                  className="text-[13px] text-red-400/60 transition-colors hover:text-red-400"
                >
                  Quitar del menú
                </button>
              ) : !isCreate && !eventId ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteFromCatalog()}
                  disabled={deleteLoading}
                  className={cn(
                    "text-[13px] transition-colors",
                    deleteConfirm
                      ? "font-semibold text-red-400 hover:text-red-300"
                      : "text-red-400/50 hover:text-red-400/80"
                  )}
                >
                  {deleteLoading
                    ? "Eliminando…"
                    : deleteConfirm
                      ? "¿Confirmar eliminación?"
                      : "Eliminar del catálogo"}
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-[14px] text-white/35 transition-colors hover:text-white/60"
              >
                Cancelar
              </button>
              <Button
                type="button"
                disabled={saving || !name.trim() || !basePrice.trim()}
                onClick={() => void handleSave()}
                className="h-11 rounded-xl bg-[#FF9500] px-6 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
              >
                {saving ? "Guardando…" : isCreate ? "Crear" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
