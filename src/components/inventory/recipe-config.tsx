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
import { Plus, Trash2, Save, GripVertical } from "lucide-react"
import type { RawMaterial } from "@/components/inventory/raw-materials"

export interface SaleProduct {
  id: string
  name: string
  price: number
  recipe: RecipeItem[]
}

interface RecipeItem {
  materialId: string
  quantity: number
}

interface RecipeConfigProps {
  products: SaleProduct[]
  materials: RawMaterial[]
  selectedProductId: string | null
  onProductSelect: (id: string) => void
}

export function RecipeConfig({
  products,
  materials,
  selectedProductId,
  onProductSelect,
}: RecipeConfigProps) {
  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const getMaterialName = (materialId: string) => {
    return materials.find((m) => m.id === materialId)?.name || "Desconocido"
  }

  const getMaterialUnit = (materialId: string) => {
    return materials.find((m) => m.id === materialId)?.unit || ""
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            Configuración de productos
          </CardTitle>
          <Button size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
        <Select
          value={selectedProductId || ""}
          onValueChange={onProductSelect}
        >
          <SelectTrigger className="mt-3 bg-secondary">
            <SelectValue placeholder="Selecciona un producto para configurar" />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex items-center justify-between gap-4">
                  <span>{product.name}</span>
                  <span className="text-muted-foreground">
                    ${product.price.toFixed(2)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {selectedProduct ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <h3 className="font-medium">{selectedProduct.name}</h3>
              <p className="text-sm text-muted-foreground">
                Precio de venta: ${selectedProduct.price.toFixed(2)}
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Ingredientes de la receta
                </h4>
                <Button size="sm" variant="ghost" className="h-8 text-primary">
                  <Plus className="mr-1 h-3 w-3" />
                  Añadir ingrediente
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {selectedProduct.recipe.map((item, index) => (
                  <div
                    key={`${item.materialId}-${index}`}
                    className="group flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50"
                  >
                    <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {getMaterialName(item.materialId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={item.quantity}
                        className="h-8 w-20 bg-secondary text-center"
                        readOnly
                      />
                      <span className="w-12 text-sm text-muted-foreground">
                        {getMaterialUnit(item.materialId)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {selectedProduct.recipe.length === 0 && (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">
                    Sin ingredientes. Añade ítems para crear la receta.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-auto pt-4">
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="mr-2 h-4 w-4" />
                Guardar receta
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              Selecciona un producto para configurar su receta
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
