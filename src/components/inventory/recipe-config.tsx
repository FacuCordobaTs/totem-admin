import { useEffect, useState } from "react"
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
import { Plus, Save, Trash2 } from "lucide-react"
import type { ApiInventoryItem, InventoryUnit } from "@/components/inventory/raw-materials"
import { apiFetch, ApiError } from "@/lib/api"

export type ProductSaleType = "BOTTLE" | "GLASS"

export interface ApiProductRecipeLine {
  id: string
  inventoryItemId: string
  quantityUsed: string
  inventoryItemName: string
  inventoryUnit: InventoryUnit
}

export interface ApiProduct {
  id: string
  name: string
  price: string
  isActive: boolean | null
  saleType?: ProductSaleType
  recipes: ApiProductRecipeLine[]
}

function unitLabel(unit: InventoryUnit): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMOS":
      return "g"
    default:
      return "uds."
  }
}

export function recipeConversionHint(
  saleType: ProductSaleType,
  material: ApiInventoryItem | undefined,
  quantityUsed: string
): string | null {
  if (!material) return null
  const q = Number.parseFloat(quantityUsed.replace(",", "."))
  if (!Number.isFinite(q) || q <= 0) return null
  const def = Number.parseFloat(material.defaultContentValue ?? "0")
  const defU = material.defaultContentUnit ?? material.unit

  if (material.unit === "ML" && defU === "ML" && def > 0) {
    if (saleType === "GLASS") {
      const drinks = Math.floor(def / q)
      return `≈ ${drinks} tragos de ${q} ml por botella estándar (${def} ml).`
    }
    return `Cada venta descuenta ${q} botella(s) × ${def} ml = ${(q * def).toLocaleString("es-AR")} ml del stock.`
  }
  if (material.unit === "GRAMOS" && defU === "GRAMOS" && def > 0 && saleType === "GLASS") {
    const portions = Math.floor(def / q)
    return `≈ ${portions} porciones de ${q} g por envase (${def} g).`
  }
  if (material.unit === "UNIDAD" && saleType === "BOTTLE") {
    return `Cada venta descuenta ${q} unidad(es) de stock.`
  }
  return null
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

type DraftLine = { inventoryItemId: string; quantityUsed: string }

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
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState<string | null>(null)

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
      selectedProduct.recipes.map((r) => ({
        inventoryItemId: r.inventoryItemId,
        quantityUsed: r.quantityUsed,
      }))
    )
  }, [selectedProduct])

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
            .filter((l) => l.inventoryItemId && Number.parseFloat(l.quantityUsed) > 0)
            .map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantityUsed: l.quantityUsed,
            })),
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
    setDraftLines((prev) => [...prev, { inventoryItemId: first, quantityUsed: "1" }])
  }

  function removeLine(index: number) {
    setDraftLines((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setDraftLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l))
    )
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

        <Select
          value={selectedProductId || ""}
          onValueChange={onProductSelect}
          disabled={loading || products.length === 0}
        >
          <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] text-[15px] dark:border-zinc-800/50 dark:bg-black">
            <SelectValue placeholder="Seleccioná un producto" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex items-center justify-between gap-4">
                  <span>{product.name}</span>
                  <span className="font-mono text-[#8E8E93] dark:text-[#98989D]">
                    ${Number.parseFloat(product.price).toFixed(2)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <p className="py-6 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Cargando productos…
            </p>
          ) : !selectedProduct ? (
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
                    <SelectItem value="GLASS">Vaso / medida (descuenta ml, g o uds. de la receta)</SelectItem>
                    <SelectItem value="BOTTLE">Botella entera (la receta cuenta botellas × tamaño estándar)</SelectItem>
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
                  {draftLines.map((line, index) => {
                    const mat = materials.find((m) => m.id === line.inventoryItemId)
                    const hint = recipeConversionHint(draftSaleType, mat, line.quantityUsed)
                    return (
                      <div
                        key={`${line.inventoryItemId}-${index}`}
                        className="flex flex-col gap-2 rounded-xl border border-zinc-200/50 bg-[#F2F2F7]/70 p-3 dark:border-zinc-800/50 dark:bg-black/20"
                      >
                        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <Select
                          value={line.inventoryItemId}
                          onValueChange={(v) =>
                            updateLine(index, { inventoryItemId: v })
                          }
                        >
                          <SelectTrigger className="min-w-[160px] flex-1 rounded-xl border-zinc-200/50 bg-background dark:border-zinc-800/50">
                            <SelectValue placeholder="Material" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {materials.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}{" "}
                                <span className="text-[#8E8E93] dark:text-[#98989D]">
                                  ({unitLabel(m.unit)})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.quantityUsed}
                          onChange={(e) =>
                            updateLine(index, { quantityUsed: e.target.value })
                          }
                          className="h-10 w-24 rounded-xl border-zinc-200/50 bg-background text-center font-mono dark:border-zinc-800/50"
                        />
                        <span className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                          {mat ? unitLabel(mat.unit) : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-xl text-[#8E8E93] hover:text-red-600 dark:text-[#98989D] dark:hover:text-red-400"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        </div>
                        {hint ? (
                          <p className="text-xs leading-snug text-[#8E8E93] dark:text-[#98989D]">
                            {hint}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
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
    </>
  )
}
