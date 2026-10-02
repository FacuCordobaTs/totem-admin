import { useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import type { ApiProductCategory } from "@/components/inventory/recipe-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function ProductCategoriesDialog({ open, onOpenChange, token, categories, onChanged }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  categories: ApiProductCategory[]
  onChanged: () => void
}) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  async function create() {
    if (!token || !name.trim() || busy) return
    setBusy(true)
    try {
      await apiFetch("/inventory/categories", { method: "POST", token, body: JSON.stringify({ name: name.trim() }) })
      setName("")
      onChanged()
      toast.success("Categoría creada")
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo crear") }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Categorías de productos</DialogTitle>
          <DialogDescription>Se comparten entre los eventos de tu productora. El orden menor aparece primero en el catálogo y el POS.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input aria-label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Ej. Comida o Bebidas" disabled={busy} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create() } }} />
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>Crear</Button>
        </div>
        <div className="space-y-4">
          {categories.map((category) => <CategoryRow key={`${category.id}:${category.name}:${category.sortOrder}`} category={category} token={token} onChanged={onChanged} />)}
          {categories.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay categorías. Podés crearlas aquí o al editar un producto.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CategoryRow({ category, token, onChanged }: { category: ApiProductCategory; token: string | null; onChanged: () => void }) {
  const [name, setName] = useState(category.name)
  const [order, setOrder] = useState(String(category.sortOrder))
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  async function mutate(remove: boolean) {
    if (!token || busy) return
    setBusy(true)
    try {
      await apiFetch(`/inventory/categories/${category.id}`, {
        method: remove ? "DELETE" : "PUT", token,
        ...(remove ? {} : { body: JSON.stringify({ name: name.trim(), sortOrder: Number(order) }) }),
      })
      onChanged()
      toast.success(remove ? "Categoría eliminada; los productos quedan sin categoría" : "Categoría guardada")
      setConfirmDelete(false)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar") }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex gap-2">
        <Input aria-label={`Nombre de ${category.name}`} value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} />
        <Input aria-label={`Orden de ${category.name}`} className="w-24" type="number" step="1" value={order} disabled={busy} onChange={(e) => setOrder(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(!confirmDelete)}>{confirmDelete ? "Cancelar" : "Eliminar"}</Button>
        <Button disabled={busy || !name.trim() || !order.trim() || !Number.isInteger(Number(order))} onClick={() => void mutate(false)}>Guardar</Button>
      </div>
      {confirmDelete ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Se eliminará «{category.name}». Sus productos siguen disponibles, sin categoría.</p><Button variant="destructive" disabled={busy} onClick={() => void mutate(true)}>Confirmar eliminación</Button></div> : null}
    </div>
  )
}
