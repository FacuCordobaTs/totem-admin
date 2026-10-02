import { useCallback, useEffect, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import type { ApiProductCategory } from "@/components/inventory/recipe-config"

export function useProductCategories(token: string | null, enabled = true) {
  const [categories, setCategories] = useState<ApiProductCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!token) { setCategories([]); return }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ categories: ApiProductCategory[] }>("/inventory/categories", { token })
      setCategories(res.categories)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las categorías")
    } finally {
      setLoading(false)
    }
  }, [token])
  useEffect(() => { if (enabled) void refresh() }, [enabled, refresh])
  return { categories, loading, error, refresh }
}
