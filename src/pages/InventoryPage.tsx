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
}

type ProductsResponse = {
  products: ApiProduct[]
}

export function InventoryPage() {
  const token = useAuthStore((s) => s.token)

  const [items, setItems] = useState<ApiInventoryItem[]>([])
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
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          <div className="mb-10 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Inventario
            </h1>
            <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
              Insumos y productos. El stock por evento se ajusta en cada evento.
            </p>
            {loadError ? (
              <p className="pt-2 text-[15px] text-red-600 dark:text-red-400" role="alert">
                {loadError}
              </p>
            ) : null}
          </div>

          <div className="grid min-h-[calc(100vh-240px)] gap-10 lg:grid-cols-2 lg:gap-12">
            <RawMaterials
              items={items}
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
