import { useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { RawMaterials, type RawMaterial } from "@/components/inventory/raw-materials"
import { RecipeConfig, type SaleProduct } from "@/components/inventory/recipe-config"

const rawMaterials: RawMaterial[] = [
  { id: "1", name: "Fernet botella 750 ml", unit: "ml", currentStock: 4500, minStock: 1500, maxStock: 7500 },
  { id: "2", name: "Lata Coca-Cola 354 ml", unit: "uds.", currentStock: 120, minStock: 50, maxStock: 200 },
  { id: "3", name: "Vaso plástico 1 L", unit: "uds.", currentStock: 35, minStock: 50, maxStock: 500 },
  { id: "4", name: "Gin botella 750 ml", unit: "ml", currentStock: 2250, minStock: 750, maxStock: 3750 },
  { id: "5", name: "Agua tónica 350 ml", unit: "uds.", currentStock: 80, minStock: 40, maxStock: 160 },
  { id: "6", name: "Vodka botella 750 ml", unit: "ml", currentStock: 3000, minStock: 1500, maxStock: 6000 },
  { id: "7", name: "Lata Red Bull 250 ml", unit: "uds.", currentStock: 15, minStock: 30, maxStock: 120 },
  { id: "8", name: "Cerveza botella 330 ml", unit: "uds.", currentStock: 200, minStock: 80, maxStock: 400 },
  { id: "9", name: "Rodajas de lima", unit: "uds.", currentStock: 150, minStock: 50, maxStock: 300 },
  { id: "10", name: "Cubitos de hielo", unit: "kg", currentStock: 25, minStock: 10, maxStock: 50 },
  { id: "11", name: "Whisky botella 750 ml", unit: "ml", currentStock: 1500, minStock: 750, maxStock: 3000 },
  { id: "12", name: "Agua botella 500 ml", unit: "uds.", currentStock: 250, minStock: 100, maxStock: 500 },
]

const saleProducts: SaleProduct[] = [
  {
    id: "1",
    name: "Combo Fernet",
    price: 12.00,
    recipe: [
      { materialId: "1", quantity: 150 },
      { materialId: "2", quantity: 1 },
      { materialId: "3", quantity: 1 },
      { materialId: "10", quantity: 0.1 },
    ],
  },
  {
    id: "2",
    name: "Gin tonic",
    price: 10.00,
    recipe: [
      { materialId: "4", quantity: 60 },
      { materialId: "5", quantity: 1 },
      { materialId: "9", quantity: 2 },
      { materialId: "10", quantity: 0.1 },
    ],
  },
  {
    id: "3",
    name: "Vodka Red Bull",
    price: 14.00,
    recipe: [
      { materialId: "6", quantity: 60 },
      { materialId: "7", quantity: 1 },
      { materialId: "10", quantity: 0.1 },
    ],
  },
  {
    id: "4",
    name: "Cerveza",
    price: 6.00,
    recipe: [
      { materialId: "8", quantity: 1 },
    ],
  },
  {
    id: "5",
    name: "Agua",
    price: 3.00,
    recipe: [
      { materialId: "12", quantity: 1 },
    ],
  },
  {
    id: "6",
    name: "Whisky on the rocks",
    price: 11.00,
    recipe: [
      { materialId: "11", quantity: 60 },
      { materialId: "10", quantity: 0.15 },
    ],
  },
]

export function InventoryPage() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | null>("1")
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Inventario PRO</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona materias primas y configura recetas de productos
            </p>
          </div>

          <div className="grid h-[calc(100vh-200px)] gap-6 lg:grid-cols-2">
            <RawMaterials
              materials={rawMaterials}
              selectedId={selectedMaterialId}
              onSelect={setSelectedMaterialId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <RecipeConfig
              products={saleProducts}
              materials={rawMaterials}
              selectedProductId={selectedProductId}
              onProductSelect={setSelectedProductId}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
