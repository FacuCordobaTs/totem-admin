import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Plus, Trash2, Save } from "lucide-react"
import type { ApiInventoryItem, InventoryUnit } from "@/components/inventory/raw-materials"
import { apiFetch, ApiError } from "@/lib/api"

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
      setDraftLines([])
      return
    }
    setDraftName(selectedProduct.name)
    setDraftPrice(selectedProduct.price)
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
      <Card className="flex h-full flex-col border-border bg-card">
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-medium">
              Productos y recetas
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={!token}
              onClick={() => {
                setNewError(null)
                setNewOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo producto
            </Button>
          </div>
          <Select
            value={selectedProductId || ""}
            onValueChange={onProductSelect}
            disabled={loading || products.length === 0}
          >
            <SelectTrigger className="mt-3 bg-secondary">
              <SelectValue placeholder="Seleccioná un producto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  <div className="flex items-center justify-between gap-4">
                    <span>{product.name}</span>
                    <span className="font-mono text-muted-foreground">
                      ${Number.parseFloat(product.price).toFixed(2)}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando productos…</p>
          ) : !selectedProduct ? (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-muted-foreground">
                {products.length === 0
                  ? "Creá un producto para armar recetas"
                  : "Seleccioná un producto para editar"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Nombre
                </label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 bg-secondary font-medium"
                />
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Precio de venta
                </label>
                <Input
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                  className="mt-1 bg-secondary font-mono"
                  inputMode="decimal"
                />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Receta (consumo por unidad vendida)
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-primary"
                    disabled={materials.length === 0}
                    onClick={addLine}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Ingrediente
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  {draftLines.map((line, index) => {
                    const mat = materials.find((m) => m.id === line.inventoryItemId)
                    return (
                      <div
                        key={`${line.inventoryItemId}-${index}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3 sm:flex-nowrap"
                      >
                        <Select
                          value={line.inventoryItemId}
                          onValueChange={(v) =>
                            updateLine(index, { inventoryItemId: v })
                          }
                        >
                          <SelectTrigger className="min-w-[160px] flex-1 bg-secondary">
                            <SelectValue placeholder="Material" />
                          </SelectTrigger>
                          <SelectContent>
                            {materials.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}{" "}
                                <span className="text-muted-foreground">
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
                          className="h-9 w-24 bg-secondary text-center font-mono"
                        />
                        <span className="text-sm text-muted-foreground">
                          {mat ? unitLabel(mat.unit) : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>

                {draftLines.length === 0 && (
                  <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border">
                    <p className="text-sm text-muted-foreground">
                      Sin ingredientes — el POS no descontará stock para este producto.
                    </p>
                  </div>
                )}
              </div>

              {saveError ? (
                <p className="text-sm text-destructive" role="alert">
                  {saveError}
                </p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={saving || !token || !draftName.trim()}
                onClick={() => void saveProduct()}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Guardando…" : "Guardar producto y receta"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitNew} className="flex flex-col gap-4">
            {newError ? (
              <p className="text-sm text-destructive" role="alert">
                {newError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="bg-secondary"
                placeholder="Ej. Fernet combo"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Precio</label>
              <Input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
                className="bg-secondary font-mono"
                placeholder="12.00"
                inputMode="decimal"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Después podés agregar la receta desde el panel de la derecha.
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={newSaving}>
                {newSaving ? "Creando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
