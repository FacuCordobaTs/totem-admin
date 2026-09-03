import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ChevronLeft, Plus, Search } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ItemsResponse = { items: ApiInventoryItem[] }
type ProductsResponse = { products: ApiProduct[] }

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function recipeSummary(product: ApiProduct): string {
  const recipes = product.recipes ?? []
  if (recipes.length === 0) return "Sin insumos configurados"

  if (product.saleType === "BOTTLE") {
    return `Botella de ${recipes.map((recipe) => recipe.inventoryItemName).join(" y ")}`
  }

  const yields = recipes.filter((recipe) => recipe.yieldPerPackage)
  if (yields.length > 0) {
    return yields
      .map((recipe, index) =>
        `${index === 0 ? "Rinde " : ""}${recipe.yieldPerPackage}${index === 0 ? " tragos" : ""} por botella de ${recipe.inventoryItemName}`
      )
      .join(" y ")
  }

  return `Trago de ${recipes.map((recipe) => recipe.inventoryItemName).join(" y ")}`
}

export function InventoryPage() {
  const token = useAuthStore((s) => s.token)

  const [items, setItems] = useState<ApiInventoryItem[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProduct, setEditorProduct] = useState<ApiProduct | null>(null)

  const [searchParams] = useSearchParams()
  const fromEventId = searchParams.get("from")
  const backHref = fromEventId ? `/eventos/${fromEventId}#bar` : "/eventos"
  const backLabel = fromEventId ? "Volver al evento" : "Volver a eventos"

  const refreshItems = useCallback(async () => {
    if (!token) { setItems([]); return }
    setLoadError(null)
    try {
      const data = await apiFetch<ItemsResponse>("/inventory/items", { method: "GET", token })
      setItems(data.items)
    } catch (err) {
      setItems([])
      setLoadError(err instanceof ApiError ? err.message : "Error al cargar ítems")
    }
  }, [token])

  const refreshProducts = useCallback(async () => {
    if (!token) { setProducts([]); setLoadingProducts(false); return }
    setLoadingProducts(true)
    try {
      const data = await apiFetch<ProductsResponse>("/inventory/products", { method: "GET", token })
      setProducts(data.products)
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [token])

  useEffect(() => { void refreshItems() }, [refreshItems])
  useEffect(() => { void refreshProducts() }, [refreshProducts])

  function bumpAll() {
    void refreshItems()
    void refreshProducts()
  }

  function openCreate() {
    setEditorProduct(null)
    setEditorOpen(true)
  }

  function openEdit(p: ApiProduct) {
    setEditorProduct(p)
    setEditorOpen(true)
  }

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
    : products

  const productGroups = useMemo(() => [
    {
      id: "GLASS",
      name: "Tragos",
      products: filteredProducts.filter((product) => (product.saleType ?? "GLASS") === "GLASS"),
    },
    {
      id: "BOTTLE",
      name: "Botellas",
      products: filteredProducts.filter((product) => product.saleType === "BOTTLE"),
    },
  ].filter((group) => group.products.length > 0), [filteredProducts])

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F2F7] dark:bg-black">
      <Header />
      <main className="flex-1">
        <div className="px-6 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-5xl">
            <div className="mb-2">
              <Link
                to={backHref}
                className="inline-flex items-center gap-1 text-sm text-[#8E8E93] transition-colors hover:text-foreground dark:text-[#98989D]"
              >
                <ChevronLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            </div>
            <div className="mb-10 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] dark:text-[#98989D]">
                Catálogo global
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Inventario
              </h1>
              <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                Productos organizados por tipo de venta.
              </p>
              {loadError ? (
                <p className="pt-2 text-[15px] text-red-600 dark:text-red-400" role="alert">
                  {loadError}
                </p>
              ) : null}
            </div>
            <section className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
                  Productos
                </h2>
                <Button
                  type="button"
                  onClick={openCreate}
                  className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo producto
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="h-10 rounded-xl border-transparent bg-black/[0.04] pl-9 text-[14px] focus-visible:border-black/10 focus-visible:ring-0 dark:bg-white/[0.05] dark:focus-visible:border-white/20"
                />
              </div>

              {loadingProducts ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-black/[0.04] dark:bg-white/[0.03]" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-[#8E8E93] dark:text-[#98989D]">
                  {productSearch ? "No hay productos que coincidan." : "No hay productos en el catálogo."}
                </p>
              ) : (
                <div className="space-y-6">
                  {productGroups.map((group) => (
                    <div key={group.id}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] dark:text-[#98989D]">
                        {group.name}
                      </p>
                      <div className="overflow-hidden divide-y divide-black/[0.05] rounded-2xl bg-background dark:divide-white/[0.06]">
                        {group.products.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => openEdit(p)}
                            className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-foreground">{p.name}</p>
                              <p className="mt-0.5 truncate text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                                {recipeSummary(p)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[14px] font-semibold text-foreground">{formatMoneyArs(p.price)}</p>
                              {p.isActive === false ? (
                                <p className="mt-0.5 text-[12px] text-[#8E8E93] dark:text-[#98989D]">Inactivo</p>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editorProduct}
        materials={items}
        token={token}
        onSaved={bumpAll}
        onDeletedFromCatalog={bumpAll}
      />
    </div>
  )
}
