import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/dashboard/header"
import { RawMaterials, type ApiInventoryItem } from "@/components/inventory/raw-materials"
import { ProductEditorDialog } from "@/components/inventory/product-editor-dialog"
import type { ApiProduct, ApiProductCategory } from "@/components/inventory/recipe-config"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ItemsResponse = { items: ApiInventoryItem[] }
type ProductsResponse = { products: ApiProduct[] }
type CategoriesResponse = { categories: ApiProductCategory[] }

const UNCATEGORIZED = "__uncat__"

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

export function InventoryPage() {
  const token = useAuthStore((s) => s.token)

  const [items, setItems] = useState<ApiInventoryItem[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [categories, setCategories] = useState<ApiProductCategory[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProduct, setEditorProduct] = useState<ApiProduct | null>(null)

  const [searchParams] = useSearchParams()
  const fromEventId = searchParams.get("from")
  const backHref = fromEventId ? `/eventos/${fromEventId}#bar` : "/eventos"
  const backLabel = fromEventId ? "Volver al evento" : "Volver a eventos"

  const refreshItems = useCallback(async () => {
    if (!token) { setItems([]); setLoadingItems(false); return }
    setLoadError(null)
    setLoadingItems(true)
    try {
      const data = await apiFetch<ItemsResponse>("/inventory/items", { method: "GET", token })
      setItems(data.items)
    } catch (err) {
      setItems([])
      setLoadError(err instanceof ApiError ? err.message : "Error al cargar ítems")
    } finally {
      setLoadingItems(false)
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

  const refreshCategories = useCallback(async () => {
    if (!token) { setCategories([]); return }
    try {
      const data = await apiFetch<CategoriesResponse>("/inventory/categories", { method: "GET", token })
      setCategories(data.categories)
    } catch {
      setCategories([])
    }
  }, [token])

  useEffect(() => { void refreshItems() }, [refreshItems])
  useEffect(() => { void refreshProducts() }, [refreshProducts])
  useEffect(() => { void refreshCategories() }, [refreshCategories])

  function bumpAll() {
    void refreshItems()
    void refreshProducts()
    void refreshCategories()
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim()
    if (!token || !trimmed || creatingCategory) return
    setCreatingCategory(true)
    try {
      await apiFetch("/inventory/categories", {
        method: "POST",
        token,
        body: JSON.stringify({ name: trimmed }),
      })
      setNewCategoryName("")
      await refreshCategories()
      toast.success("Categoría creada")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la categoría")
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!token) return
    try {
      await apiFetch(`/inventory/categories/${categoryId}`, { method: "DELETE", token })
      toast.success("Categoría eliminada")
      await refreshCategories()
      await refreshProducts()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar la categoría")
    }
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

  const productGroups = useMemo(() => {
    const byCategory = new Map<string, ApiProduct[]>()
    for (const p of filteredProducts) {
      const key = p.categoryId ?? UNCATEGORIZED
      const list = byCategory.get(key) ?? []
      list.push(p)
      byCategory.set(key, list)
    }
    const groups: { id: string; name: string; products: ApiProduct[] }[] = []
    for (const cat of categories) {
      const list = byCategory.get(cat.id)
      if (list && list.length > 0) {
        groups.push({ id: cat.id, name: cat.name, products: list })
      }
    }
    const uncat = byCategory.get(UNCATEGORIZED)
    if (uncat && uncat.length > 0) {
      groups.push({ id: UNCATEGORIZED, name: "Sin categoría", products: uncat })
    }
    return groups
  }, [filteredProducts, categories])

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F2F7] dark:bg-black">
      <Header />
      <main className="flex-1">
        <div className="px-6 py-10 lg:px-10 lg:py-12">
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
              selectedId={null}
              onSelect={() => {}}
              searchQuery=""
              onSearchChange={() => {}}
              onChanged={bumpAll}
            />

            {/* Productos */}
            <section className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
                  Productos
                </h2>
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 text-[13px] text-[#8E8E93] transition-colors hover:text-foreground dark:text-[#98989D]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo producto
                </button>
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

              {/* Categorías */}
              <div className="space-y-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] dark:text-[#98989D]">
                  Categorías
                </p>
                {categories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="flex items-center gap-1.5 rounded-lg bg-black/[0.05] py-1 pl-3 pr-1.5 text-[13px] font-medium text-foreground dark:bg-white/[0.07]"
                      >
                        {cat.name}
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(cat.id)}
                          className="flex h-5 w-5 items-center justify-center rounded-md text-[#8E8E93] transition-colors hover:bg-black/[0.06] hover:text-red-500 dark:hover:bg-white/[0.08]"
                          aria-label={`Eliminar categoría ${cat.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                    Sin categorías. Agrupá tus productos creando una.
                  </p>
                )}
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
                    placeholder="Nueva categoría…"
                    className="h-9 rounded-lg border-transparent bg-background text-[13px] focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    disabled={creatingCategory || !newCategoryName.trim()}
                    onClick={() => void handleCreateCategory()}
                    className="h-9 shrink-0 rounded-lg bg-[#FF9500] px-3 text-[13px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
                      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                        {group.products.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => openEdit(p)}
                            className={cn(
                              "flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                              p.isActive === false && "opacity-40"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-foreground">{p.name}</p>
                              <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                                {formatMoneyArs(p.price)}
                                {p.isActive === false ? (
                                  <span className="ml-2">· Inactivo</span>
                                ) : null}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#C7C7CC] dark:text-[#48484A]" />
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
        categories={categories}
        onCategoriesChanged={refreshCategories}
        token={token}
        onSaved={bumpAll}
        onDeletedFromCatalog={bumpAll}
      />
    </div>
  )
}
