import { useEffect, useState } from "react"
import { toast } from "sonner"
import { X, Plus, ChevronRight, ChevronLeft, Loader2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RecipeIngredientRow } from "@/components/inventory/recipe-ingredient-row"
import { ProductImageUploader } from "@/components/inventory/product-image-uploader"
import {
  draftLineQuantityForApi,
  materialSupportsFullBottle,
  recipeApiLineToDraft,
  type ProductSaleType,
  type RecipeDraftLine,
} from "@/lib/inventory-recipe-helpers"
import type { ApiInventoryItem, InventoryBaseUnit } from "@/components/inventory/raw-materials"
import type { ApiProduct, ApiProductCategory } from "@/components/inventory/recipe-config"
import { cn } from "@/lib/utils"

type MaterialKind = "liquid" | "solid" | "unit"

function kindToBaseUnit(k: MaterialKind): InventoryBaseUnit {
  if (k === "liquid") return "ML"
  if (k === "solid") return "GRAMS"
  return "UNIT"
}

function packageLabel(kind: MaterialKind): string {
  if (kind === "liquid") return "Tamaño del envase (ml)"
  if (kind === "solid") return "Peso del envase (g)"
  return "Unidades por paquete"
}

const SALE_TYPE_OPTIONS: { value: ProductSaleType; label: string; desc: string }[] = [
  {
    value: "GLASS",
    label: "Por unidad / trago",
    desc: "Cada venta descuenta una cantidad fija de insumos según la receta. Ideal para tragos, vasos o porciones.",
  },
  {
    value: "BOTTLE",
    label: "Botella entera",
    desc: "Cada venta descuenta un envase completo del insumo principal. Ideal para vender botellas de licor, vino, etc.",
  },
]

const WIZARD_STEPS = ["Básicos", "Tipo", "Insumos"]

const inputClass =
  "h-12 rounded-xl border-0 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/20 focus-visible:ring-0"

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
  /** Categorías del catálogo (global). */
  categories?: ApiProductCategory[]
  /** Llamado cuando se crea una categoría nueva desde el diálogo. */
  onCategoriesChanged?: () => void
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
  categories = [],
  onCategoriesChanged,
  token,
  onSaved,
  onRemovedFromMenu,
  onDeletedFromCatalog,
}: ProductEditorDialogProps) {
  const isCreate = product === null

  // Form state
  const [name, setName] = useState("")
  const [basePrice, setBasePrice] = useState("")
  const [eventPrice, setEventPrice] = useState("")
  const [saleType, setSaleType] = useState<ProductSaleType>("GLASS")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [recipeDraftLines, setRecipeDraftLines] = useState<RecipeDraftLine[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Wizard state (create mode only)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  // Merges prop materials + any newly created inline materials
  const [localMaterials, setLocalMaterials] = useState<ApiInventoryItem[]>([])

  // Inline material creation (step 3)
  const [inlineMatOpen, setInlineMatOpen] = useState(false)
  const [inlineMatName, setInlineMatName] = useState("")
  const [inlineMatKind, setInlineMatKind] = useState<MaterialKind>("liquid")
  const [inlineMatPkg, setInlineMatPkg] = useState("")
  const [inlineMatSaving, setInlineMatSaving] = useState(false)

  useEffect(() => {
    setLocalMaterials(materials)
  }, [materials])

  useEffect(() => {
    if (!open) return
    setDeleteConfirm(false)
    setNewCategoryOpen(false)
    setNewCategoryName("")
    setWizardStep(1)
    setInlineMatOpen(false)
    setInlineMatName("")
    setInlineMatKind("liquid")
    setInlineMatPkg("")
    if (product) {
      setName(product.name)
      setBasePrice(product.price)
      setEventPrice(priceOverride ?? "")
      setSaleType(product.saleType ?? "GLASS")
      setCategoryId(product.categoryId ?? null)
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
      setCategoryId(null)
      setRecipeDraftLines([])
    }
  }, [open, product, priceOverride, materials])

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim()
    if (!token || !trimmed || creatingCategory) return
    setCreatingCategory(true)
    try {
      const res = await apiFetch<{ category: ApiProductCategory }>(
        "/inventory/categories",
        { method: "POST", token, body: JSON.stringify({ name: trimmed }) }
      )
      setCategoryId(res.category.id)
      setNewCategoryOpen(false)
      setNewCategoryName("")
      onCategoriesChanged?.()
      toast.success("Categoría creada")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la categoría")
    } finally {
      setCreatingCategory(false)
    }
  }

  function addLine() {
    const all = localMaterials
    const first = all[0]?.id
    if (!first) {
      toast.message("Creá un insumo primero usando el botón de abajo")
      return
    }
    setRecipeDraftLines((prev) => [
      ...prev,
      { inventoryItemId: first, quantityUsed: "1", useFullBottle: false },
    ])
  }

  async function handleCreateInlineMaterial() {
    if (!token || !inlineMatName.trim() || inlineMatSaving) return
    setInlineMatSaving(true)
    try {
      const baseUnit = kindToBaseUnit(inlineMatKind)
      const body: Record<string, unknown> = {
        name: inlineMatName.trim(),
        baseUnit,
      }
      const rawPkg = inlineMatPkg.trim().replace(",", ".")
      if (rawPkg !== "") body.packageSize = rawPkg

      const res = await apiFetch<{ item: ApiInventoryItem }>("/inventory/items", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })

      const newItem = res.item
      setLocalMaterials((prev) => [...prev, newItem])
      setRecipeDraftLines((prev) => [
        ...prev,
        { inventoryItemId: newItem.id, quantityUsed: "1", useFullBottle: false },
      ])
      setInlineMatOpen(false)
      setInlineMatName("")
      setInlineMatKind("liquid")
      setInlineMatPkg("")
      toast.success("Insumo creado y agregado a la receta")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el insumo")
    } finally {
      setInlineMatSaving(false)
    }
  }

  async function handleSave() {
    if (!token || !name.trim() || !basePrice.trim()) return
    setSaving(true)
    try {
      const effectiveMaterials = localMaterials
      const recipes = recipeDraftLines
        .filter((l) => lineIsSavable(l, effectiveMaterials, saleType))
        .map((l) => ({
          inventoryItemId: l.inventoryItemId,
          quantityUsed: draftLineQuantityForApi(
            l,
            effectiveMaterials.find((m) => m.id === l.inventoryItemId)
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
            categoryId,
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
            categoryId,
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

  // ── WIZARD (create mode) ──────────────────────────────────────────────────

  if (isCreate) {
    const step1Valid = name.trim().length > 0 && basePrice.trim().length > 0

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-black p-0 sm:max-w-[600px]">
          {/* Header */}
          <DialogHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-6 py-5">
            <div className="flex flex-col gap-3">
              {/* Step indicator */}
              <div className="flex items-center gap-0">
                {WIZARD_STEPS.map((label, i) => {
                  const stepNum = (i + 1) as 1 | 2 | 3
                  const isActive = wizardStep === stepNum
                  const isDone = wizardStep > stepNum
                  return (
                    <div key={label} className="flex items-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                            isDone
                              ? "bg-white/20 text-white"
                              : isActive
                                ? "bg-[#FF9500] text-white"
                                : "bg-white/[0.06] text-white/25"
                          )}
                        >
                          {isDone ? "✓" : stepNum}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] font-medium transition-colors",
                            isActive ? "text-white" : isDone ? "text-white/40" : "text-white/20"
                          )}
                        >
                          {label}
                        </span>
                      </div>
                      {i < WIZARD_STEPS.length - 1 && (
                        <div
                          className={cn(
                            "mb-5 mx-2 h-px w-10 transition-colors",
                            wizardStep > stepNum ? "bg-white/20" : "bg-white/[0.08]"
                          )}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </DialogHeader>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-7 p-6">

              {/* ── PASO 1: BÁSICOS ── */}
              {wizardStep === 1 && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-[22px] font-bold text-white">Nuevo Producto</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] text-white/45">Nombre</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                      placeholder="Ej. Fernet con Coca"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && step1Valid) setWizardStep(2)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] text-white/45">Precio base</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-white/30">$</span>
                      <Input
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        className={cn(inputClass, "pl-8 font-mono")}
                        inputMode="decimal"
                        placeholder="0"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && step1Valid) setWizardStep(2)
                        }}
                      />
                    </div>
                    <p className="text-[12px] text-white/25">
                      Precio en el catálogo. Se usa si no definís un precio específico para el evento.
                    </p>
                  </div>

                  {eventId ? (
                    <div className="space-y-2">
                      <label className="text-[13px] text-white/45">
                        Precio para este evento{" "}
                        <span className="text-white/20">(opcional)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-white/30">$</span>
                        <Input
                          value={eventPrice}
                          onChange={(e) => setEventPrice(e.target.value)}
                          className={cn(inputClass, "pl-8 font-mono")}
                          inputMode="decimal"
                          placeholder="Usa precio base"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && step1Valid) setWizardStep(2)
                          }}
                        />
                      </div>
                      <p className="text-[12px] text-white/25">
                        Solo afecta este evento. Dejá vacío para usar el precio base.
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {/* ── PASO 2: TIPO Y CATEGORÍA ── */}
              {wizardStep === 2 && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-[22px] font-bold text-white">¿Cómo se vende?</p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[13px] text-white/45">Tipo de venta</label>
                    <div className="space-y-2">
                      {SALE_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSaleType(opt.value)}
                          className={cn(
                            "w-full rounded-xl px-4 py-3.5 text-left transition-colors",
                            saleType === opt.value
                              ? "bg-white/[0.1]"
                              : "bg-white/[0.03] hover:bg-white/[0.06]"
                          )}
                        >
                          <p
                            className={cn(
                              "text-[14px] font-semibold",
                              saleType === opt.value ? "text-white" : "text-white/50"
                            )}
                          >
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-[12px] text-white/25">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[13px] text-white/45 mb-1">
                      Categoría <span className="text-white/20">(opcional)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCategoryId(null)}
                        className={cn(
                          "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors mt-2",
                          categoryId === null
                            ? "bg-[#FF9500] text-white"
                            : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80"
                        )}
                      >
                        Sin categoría
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategoryId(cat.id)}
                          className={cn(
                            "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors",
                            categoryId === cat.id
                              ? "bg-[#FF9500] text-white"
                              : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80"
                          )}
                        >
                          {cat.name}
                        </button>
                      ))}
                      {!newCategoryOpen ? (
                        <button
                          type="button"
                          onClick={() => setNewCategoryOpen(true)}
                          className="flex items-center gap-1 rounded-xl border border-white/[0.1] px-3.5 py-2 text-[13px] font-medium text-white/35 transition-colors hover:text-white/60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Nueva
                        </button>
                      ) : null}
                    </div>
                    {newCategoryOpen ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              void handleCreateCategory()
                            }
                          }}
                          className={cn(inputClass, "h-11")}
                          placeholder="Nombre de la categoría"
                          autoFocus
                        />
                        <Button
                          type="button"
                          disabled={creatingCategory || !newCategoryName.trim()}
                          onClick={() => void handleCreateCategory()}
                          className="h-11 shrink-0 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
                        >
                          {creatingCategory ? "Creando…" : "Crear"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewCategoryOpen(false)
                            setNewCategoryName("")
                          }}
                          className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-white/60"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {/* ── PASO 3: INSUMOS / RECETA ── */}
              {wizardStep === 3 && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-[22px] font-bold text-white">Receta de insumos</p>                    
                  </div>

                  {/* Recipe lines */}
                  {recipeDraftLines.length > 0 ? (
                    <div className="space-y-3">
                      {recipeDraftLines.map((line, idx) => (
                        <RecipeIngredientRow
                          key={`${line.inventoryItemId}-${idx}`}
                          line={line}
                          index={idx}
                          materials={localMaterials}
                          saleType={saleType}
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
                  ) : (
                    <p className="py-2 text-[13px] text-white/20">Sin insumos — podés crear el producto sin receta.</p>
                  )}

                  {/* Add buttons */}
                  {!inlineMatOpen && (
                    <div className="flex flex-wrap gap-2">
                      {localMaterials.length > 0 && (
                        <button
                          type="button"
                          onClick={addLine}
                          className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3.5 py-2 text-[13px] text-white/50 transition-colors hover:bg-white/[0.1] hover:text-white/80"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Agregar insumo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setInlineMatOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-3.5 py-2 text-[13px] text-white/35 transition-colors hover:text-white/60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Crear nuevo insumo
                      </button>
                    </div>
                  )}

                  {/* Inline material creation form */}
                  {inlineMatOpen ? (
                    <div className="space-y-4 pt-1">
                      <p className="text-[13px] font-semibold text-white/60">Nuevo insumo</p>

                      <div className="space-y-2">
                        <label className="text-[12px] text-white/40">Nombre</label>
                        <Input
                          value={inlineMatName}
                          onChange={(e) => setInlineMatName(e.target.value)}
                          className={cn(inputClass, "h-10 text-[14px]")}
                          placeholder="Ej. Fernet Branca"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[12px] text-white/40">Tipo</label>
                          <Select
                            value={inlineMatKind}
                            onValueChange={(v) => setInlineMatKind(v as MaterialKind)}
                          >
                            <SelectTrigger className="h-10 rounded-xl border-0 bg-white/[0.06] text-[14px] text-white focus:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-white/[0.08] bg-[#0d0d0d] text-white">
                              <SelectItem value="liquid">Líquido (ml)</SelectItem>
                              <SelectItem value="solid">Sólido (g)</SelectItem>
                              <SelectItem value="unit">Unidad</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[12px] text-white/40">
                            {packageLabel(inlineMatKind)}{" "}
                            <span className="text-white/20">(opc.)</span>
                          </label>
                          <Input
                            value={inlineMatPkg}
                            onChange={(e) => setInlineMatPkg(e.target.value)}
                            className={cn(inputClass, "h-10 font-mono text-[14px]")}
                            inputMode="decimal"
                            placeholder={inlineMatKind === "unit" ? "Ej. 6" : "Ej. 750"}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setInlineMatOpen(false)
                            setInlineMatName("")
                            setInlineMatKind("liquid")
                            setInlineMatPkg("")
                          }}
                          className="text-[13px] text-white/35 transition-colors hover:text-white/60"
                        >
                          Cancelar
                        </button>
                        <Button
                          type="button"
                          disabled={inlineMatSaving || !inlineMatName.trim()}
                          onClick={() => void handleCreateInlineMaterial()}
                          className="h-9 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
                        >
                          {inlineMatSaving ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Creando…
                            </>
                          ) : (
                            "Crear y agregar"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Footer navigation */}
          <div className="border-t border-white/[0.06] px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Left: back or cancel */}
              {wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-[14px] text-white/35 transition-colors hover:text-white/60"
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="flex items-center gap-1 text-[14px] text-white/40 transition-colors hover:text-white/70"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
              )}

              {/* Right: next or create */}
              {wizardStep < 3 ? (
                <Button
                  type="button"
                  disabled={wizardStep === 1 && !step1Valid}
                  onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#FF9500] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="h-11 rounded-xl bg-[#FF9500] px-6 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando…
                    </>
                  ) : (
                    "Crear producto"
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ── EDIT MODE (form sin cambios) ──────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-black p-0 sm:max-w-[720px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
            Editar producto
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
                      "w-full rounded-xl px-4 py-3.5 text-left transition-colors",
                      saleType === opt.value
                        ? "bg-white/[0.1]"
                        : "bg-white/[0.03] hover:bg-white/[0.06]"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[14px] font-semibold",
                        saleType === opt.value ? "text-white" : "text-white/50"
                      )}
                    >
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-white/25">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría */}
            <div className="space-y-3">
              <label className="text-[13px] text-white/45">
                Categoría <span className="text-white/20">(opcional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryId(null)}
                  className={cn(
                    "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors",
                    categoryId === null
                      ? "bg-[#FF9500] text-white"
                      : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80"
                  )}
                >
                  Sin categoría
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors",
                      categoryId === cat.id
                        ? "bg-[#FF9500] text-white"
                        : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
                {!newCategoryOpen ? (
                  <button
                    type="button"
                    onClick={() => setNewCategoryOpen(true)}
                    className="flex items-center gap-1 rounded-xl border border-white/[0.1] px-3.5 py-2 text-[13px] font-medium text-white/35 transition-colors hover:text-white/60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nueva
                  </button>
                ) : null}
              </div>
              {newCategoryOpen ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handleCreateCategory()
                      }
                    }}
                    className={cn(inputClass, "h-11")}
                    placeholder="Nombre de la categoría"
                    autoFocus
                  />
                  <Button
                    type="button"
                    disabled={creatingCategory || !newCategoryName.trim()}
                    onClick={() => void handleCreateCategory()}
                    className="h-11 shrink-0 rounded-xl bg-[#FF9500] px-4 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
                  >
                    {creatingCategory ? "Creando…" : "Crear"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryOpen(false)
                      setNewCategoryName("")
                    }}
                    className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-white/60"
                  >
                    Cancelar
                  </button>
                </div>
              ) : null}
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
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
