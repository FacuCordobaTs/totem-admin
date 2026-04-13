import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import {
  RawMaterials,
  type ApiInventoryItem,
} from "@/components/inventory/raw-materials"
import {
  RecipeConfig,
  type ApiProduct,
} from "@/components/inventory/recipe-config"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"

type ItemsResponse = {
  items: ApiInventoryItem[]
  alertThreshold: string
}

type ProductsResponse = {
  products: ApiProduct[]
}

export function InventoryPage() {
  const token = useAuthStore((s) => s.token)

  const [items, setItems] = useState<ApiInventoryItem[]>([])
  const [alertThreshold, setAlertThreshold] = useState("100")
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const refreshItems = useCallback(async () => {
    if (!token) {
      setItems([])
      setLoadingItems(false)
      return
    }
    setLoadError(null)
    setLoadingItems(true)
    try {
      const data = await apiFetch<ItemsResponse>("/inventory/items", {
        method: "GET",
        token,
      })
      setItems(data.items)
      setAlertThreshold(data.alertThreshold)
    } catch (err) {
      setItems([])
      setLoadError(err instanceof ApiError ? err.message : "Error al cargar ítems")
    } finally {
      setLoadingItems(false)
    }
  }, [token])

  const refreshProducts = useCallback(async () => {
    if (!token) {
      setProducts([])
      setLoadingProducts(false)
      return
    }
    setLoadingProducts(true)
    try {
      const data = await apiFetch<ProductsResponse>("/inventory/products", {
        method: "GET",
        token,
      })
      setProducts(data.products)
      setSelectedProductId((prev) => {
        if (prev && data.products.some((p) => p.id === prev)) return prev
        return data.products[0]?.id ?? null
      })
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [token])

  useEffect(() => {
    void refreshItems()
  }, [refreshItems])

  useEffect(() => {
    void refreshProducts()
  }, [refreshProducts])

  function bumpAll() {
    void refreshItems()
    void refreshProducts()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Inventario PRO</h1>
            <p className="text-sm text-muted-foreground">
              Materias primas, productos y recetas — descuenta stock en cada venta del POS
            </p>
            {loadError ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {loadError}
              </p>
            ) : null}
          </div>

          <div className="grid min-h-[calc(100vh-220px)] gap-6 lg:grid-cols-2">
            <RawMaterials
              items={items}
              alertThreshold={alertThreshold}
              loading={loadingItems}
              token={token}
              selectedId={selectedMaterialId}
              onSelect={setSelectedMaterialId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onChanged={bumpAll}
            />
            <RecipeConfig
              products={products}
              materials={items}
              loading={loadingProducts}
              token={token}
              selectedProductId={selectedProductId}
              onProductSelect={setSelectedProductId}
              onChanged={bumpAll}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
