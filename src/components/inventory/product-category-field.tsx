import { useId, useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useProductCategories } from "@/hooks/useProductCategories"
import type { ApiProductCategory } from "@/components/inventory/recipe-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ProductCategoryField({ token, value, onChange, disabled, onBusyChange }: {
  token: string | null
  value: string | null
  onChange: (value: string | null) => void
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const id = useId()
  const { categories, loading, error, refresh } = useProductCategories(token)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!token || !name.trim() || saving) return
    const existing = categories.find((c) => c.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    if (existing) { onChange(existing.id); setCreating(false); setName(""); return }
    setSaving(true)
    onBusyChange(true)
    try {
      const res = await apiFetch<{ category: ApiProductCategory }>("/inventory/categories", {
        method: "POST", token, body: JSON.stringify({ name: name.trim() }),
      })
      await refresh()
      onChange(res.category.id)
      setCreating(false)
      setName("")
      toast.success("Categoría creada")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la categoría")
    } finally { setSaving(false); onBusyChange(false) }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-[13px] text-white/45">Categoría</label>
      <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)} disabled={disabled || loading || saving || !!error}>
        <SelectTrigger id={id} className="h-12 w-full rounded-xl border-0 bg-white/[0.06] text-white">
          <SelectValue placeholder={loading ? "Cargando categorías…" : "Elegí una categoría"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sin categoría</SelectItem>
          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {error ? <p role="alert" className="text-xs text-red-400">{error} <button type="button" className="underline" onClick={() => void refresh()}>Reintentar</button></p> : null}
      <p className="text-xs text-white/30">Organizá el catálogo y la caja, por ejemplo: Comida y Bebidas.</p>
      {creating ? (
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Nombre de la nueva categoría" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Ej. Comida" disabled={disabled || saving} className="min-w-40 flex-1 border-white/10 bg-white/[0.06] text-white" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create() } }} />
          <Button type="button" disabled={disabled || saving || !name.trim()} onClick={() => void create()}>Crear y asignar</Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setCreating(false)}>Cancelar</Button>
        </div>
      ) : <button type="button" disabled={disabled || loading || !!error} className="text-sm text-[#FF9500] disabled:opacity-40" onClick={() => setCreating(true)}>+ Nueva categoría</button>}
    </div>
  )
}
