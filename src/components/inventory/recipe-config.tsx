import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Save, Pencil, Trash2 } from "lucide-react"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { RecipeIngredientRow } from "@/components/inventory/recipe-ingredient-row"
import { apiFetch, ApiError } from "@/lib/api"
import {
  draftLineQuantityForApi,
  materialSupportsFullBottle,
  recipeApiLineToDraft,
  type ProductSaleType,
  type RecipeDraftLine,
} from "@/lib/inventory-recipe-helpers"
import { cn } from "@/lib/utils"

export type { ProductSaleType }

export interface ApiProductRecipeLine {
  id: string
  inventoryItemId: string
  quantityUsed: string
  inventoryItemName: string
  inventoryBaseUnit: ApiInventoryItem["baseUnit"]
  inventoryPackageSize: string
}

export interface ApiProduct {
  id: string
  name: string
  price: string
  isActive: boolean | null
  saleType?: ProductSaleType
  recipes: ApiProductRecipeLine[]
}

interface RecipeConfigProps {
  products: ApiProduct[]
  materials: ApiInventoryItem[]
  loading: boolean
  token: string | null
  selectedProductId: string | null
  onProductSelect: (id: string) => void
  onChanged: () => void
}

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

export function RecipeConfig({
  products,
  materials,
  loading,
  token,
  selectedProductId,
  onProductSelect,
  onChanged,
}: RecipeConfigProps) {
  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const [draftName, setDraftName] = useState("")
  const [draftPrice, setDraftPrice] = useState("")
  const [draftSaleType, setDraftSaleType] = useState<ProductSaleType>("GLASS")
  const [draftLines, setDraftLines] = useState<RecipeDraftLine[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<ApiProduct | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setSaveError(null)
    if (!selectedProduct) {
      setDraftName("")
      setDraftPrice("")
      setDraftSaleType("GLASS")
      setDraftLines([])
      return
    }
    setDraftName(selectedProduct.name)
    setDraftPrice(selectedProduct.price)
    setDraftSaleType(selectedProduct.saleType ?? "GLASS")
    setDraftLines(
      selectedProduct.recipes.map((r) => {
        const mat = materials.find((m) => m.id === r.inventoryItemId)
        return recipeApiLineToDraft(r, mat)
      })
    )
  }, [selectedProduct, materials])

  async function saveProduct() {
    if (!token || !selectedProductId) return
    setSaveError(null)
    setSaving(true)
    try {
      await apiFetch(`/inventory/products/${selectedProductId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          name: draftName.trim(),
          price: draftPrice,
          saleType: draftSaleType,
          recipes: draftLines
            .filter((l) => lineIsSavable(l, materials, draftSaleType))
            .map((l) => {
              const mat = materials.find((m) => m.id === l.inventoryItemId)
              return {
                inventoryItemId: l.inventoryItemId,
                quantityUsed: draftLineQuantityForApi(l, mat),
              }
            }),
        }),
      })
      onChanged()
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  function addLine() {
    const first = materials[0]?.id
    if (!first) return
    setDraftLines((prev) => [
      ...prev,
      { inventoryItemId: first, quantityUsed: "1", useFullBottle: false },
    ])
  }

  function removeLine(index: number) {
    setDraftLines((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLine(index: number, patch: Partial<RecipeDraftLine>) {
    setDraftLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setNewError(null)
    setNewSaving(true)
    try {
      const res = await apiFetch<{ product: ApiProduct }>("/inventory/products", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: newName.trim(),
          price: newPrice,
          recipes: [],
        }),
      })
      setNewOpen(false)
      setNewName("")
      setNewPrice("")
      onProductSelect(res.product.id)
      onChanged()
    } catch (err) {
      setNewError(err instanceof ApiError ? err.message : "No se pudo crear")
    } finally {
      setNewSaving(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      const res = await apiFetch<{
        ok?: boolean
        deactivated?: boolean
        message?: string
      }>(`/inventory/products/${deleteTarget.id}`, {
        method: "DELETE",
        token,
      })
      setDeleteTarget(null)
      onChanged()
      toast.success(res.message ?? "Producto desactivado")
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo eliminar")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <section className="flex h-full flex-col gap-6 rounded-2xl bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Productos
          </h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!token}
            onClick={() => {
              setNewError(null)
              setNewOpen(true)
            }}
            className="h-10 gap-1.5 rounded-xl text-[14px] font-semibold text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>

        <div className="min-h-0 max-h-[220px] flex-1 overflow-auto rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
          {loading ? (
            <p className="p-4 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Cargando productos…
            </p>
          ) : products.length === 0 ? (
            <p className="p-4 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              No hay productos. Creá uno con &quot;Nuevo&quot;.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
              {products.map((product) => {
                const active = product.id === selectedProductId
                return (
                  <li
                    key={product.id}
                    className={cn(
                      "group flex items-center gap-1 px-2 py-2 transition-colors",
                      active ? "bg-[#FF9500]/10" : "hover:bg-[#F2F2F7]/80 dark:hover:bg-zinc-800/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onProductSelect(product.id)}
                      className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
                    >
                      <span className="block truncate font-medium text-foreground">
                        {product.name}
                      </span>
                      <span className="font-mono text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                        ${Number.parseFloat(product.price).toFixed(2)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onProductSelect(product.id)}
                      className="rounded-lg p-2 opacity-0 transition-opacity hover:bg-zinc-500/10 group-hover:opacity-100"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(product)}
                      className="rounded-lg p-2 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                      title="Desactivar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!selectedProduct ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                {products.length === 0
                  ? "Creá un producto para armar recetas"
                  : "Seleccioná un producto para editar"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div className="space-y-4 rounded-xl bg-[#F2F2F7]/80 p-4 dark:bg-black/30">
                <label className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                  Nombre
                </label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="h-11 rounded-xl border-zinc-200/50 bg-background font-medium dark:border-zinc-800/50"
                />
                <label className="block text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                  Precio de venta
                </label>
                <Input
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                  className="h-11 rounded-xl border-zinc-200/50 bg-background font-mono dark:border-zinc-800/50"
                  inputMode="decimal"
                />
                <label className="block text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                  Tipo de venta (stock)
                </label>
                <Select
                  value={draftSaleType}
                  onValueChange={(v) => setDraftSaleType(v as ProductSaleType)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-background dark:border-zinc-800/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="GLASS">
                      Vaso / medida (descuenta ml, g o uds. de la receta)
                    </SelectItem>
                    <SelectItem value="BOTTLE">
                      Botella entera (envases × tamaño del insumo)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[15px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                    Receta
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-1 rounded-xl text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
                    disabled={materials.length === 0}
                    onClick={addLine}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Línea
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  {draftLines.map((line, index) => (
                    <RecipeIngredientRow
                      key={`${line.inventoryItemId}-${index}`}
                      line={line}
                      index={index}
                      materials={materials}
                      saleType={draftSaleType}
                      onChange={updateLine}
                      onRemove={removeLine}
                    />
                  ))}
                </div>

                {draftLines.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-200/50 dark:border-zinc-800/50">
                    <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                      Sin ingredientes.
                    </p>
                  </div>
                )}
              </div>

              {saveError ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {saveError}
                </p>
              ) : null}

              <Button
                type="button"
                className="h-11 w-full rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90"
                disabled={saving || !token || !draftName.trim()}
                onClick={() => void saveProduct()}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Guardando…" : "Guardar producto y receta"}
              </Button>
            </div>
          )}
        </div>
      </section>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="rounded-2xl border-zinc-200/50 bg-background sm:max-w-md dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Nuevo producto
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitNew} className="flex flex-col gap-4">
            {newError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {newError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Nombre</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                placeholder="Ej. Fernet combo"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Precio</label>
              <Input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] font-mono dark:border-zinc-800/50 dark:bg-black"
                placeholder="12.00"
                inputMode="decimal"
              />
            </div>
            <p className="text-xs text-[#8E8E93] dark:text-[#98989D]">
              Después podés agregar la receta desde el panel de la derecha.
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setNewOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={newSaving} className="rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90">
                {newSaving ? "Creando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-zinc-200/50 dark:border-zinc-800/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar producto</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `¿Desactivar «${deleteTarget.name}»? Dejará de mostrarse en el catálogo de inventario; el historial de ventas no cambia.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              {deleting ? "…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
