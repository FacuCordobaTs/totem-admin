import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Tarea 9.1 — Promotores (visión §2.8): personas que venden entradas a comisión por la
// productora. Viven a nivel TENANT (trabajan en todos los eventos) y cada venta puede
// atribuírseles (entradas manuales y caja POS). El ABM vive en la sección Equipo.
export type ApiPromoter = {
  id: string
  name: string
  phone: string | null
  isActive: boolean
  createdAt: string | null
}

type PromotersResponse = { promoters: ApiPromoter[] }

export function PromotersPanel() {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const canCreateStaff = role === "ADMIN"

  const [rows, setRows] = useState<ApiPromoter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  // Alta y edición comparten el mismo formulario inline (editingId null = alta).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<PromotersResponse>("/promoters", {
        method: "GET",
        token,
      })
      setRows(data.promoters)
    } catch (e) {
      setRows([])
      setError(
        e instanceof ApiError ? e.message : "No se pudieron cargar los promotores"
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(p: ApiPromoter) {
    setEditingId(p.id)
    setName(p.name)
    setPhone(p.phone ?? "")
    setDialogOpen(true)
  }

  function addPending(id: string) {
    setPendingIds((prev) => new Set(prev).add(id))
  }
  function removePending(id: string) {
    setPendingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function save() {
    if (!token || !canManage || name.trim() === "" || saving) return
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        ...(phone.trim() !== "" ? { phone: phone.trim() } : {}),
      }
      if (editingId == null) {
        await apiFetch("/promoters", {
          method: "POST",
          token,
          body: JSON.stringify(body),
        })
        toast.success("Promotor creado")
      } else {
        await apiFetch(`/promoters/${editingId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(body),
        })
        toast.success("Promotor actualizado")
      }
      setEditingId(null)
      setName("")
      setPhone("")
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo guardar el promotor"
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: ApiPromoter) {
    if (!token || !canManage || pendingIds.has(p.id)) return
    const prevRows = rows
    addPending(p.id)
    setRows((r) =>
      r.map((x) =>
        x.id === p.id ? { ...x, isActive: !p.isActive } : x
      )
    )
    try {
      await apiFetch(`/promoters/${p.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: !p.isActive }),
      })
    } catch (e) {
      setRows(prevRows)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el promotor"
      )
    } finally {
      removePending(p.id)
    }
  }

  async function remove(p: ApiPromoter) {
    if (!token || !canManage || pendingIds.has(p.id)) return
    if (!window.confirm(`¿Quitar a ${p.name} de los promotores?`)) return
    const prevRows = rows
    addPending(p.id)
    try {
      await apiFetch(`/promoters/${p.id}`, {
        method: "DELETE",
        token,
      })
      await load()
      toast.success("Promotor quitado")
    } catch (e) {
      setRows(prevRows)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo quitar el promotor"
      )
    } finally {
      removePending(p.id)
    }
  }

  const editing = editingId != null
  const activeRows = rows.filter((p) => p.isActive)
  const inactiveCount = rows.length - activeRows.length

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[17px] font-medium text-foreground">Promotores</h3>
          <p className="text-[13px] text-white/40">
            Quién vende entradas a comisión. Cada venta puede atribuírseles.
          </p>
        </div>
        {canCreateStaff ? (
          <Button asChild type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl text-[13px] font-medium">
            <Link to="/staff">
            <Plus className="h-3.5 w-3.5" />
            Crear desde Personal
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
            />
          ))}
        </div>
      ) : activeRows.length === 0 && !editing ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-6 text-center text-[14px] text-white/45">
          Todavía no hay promotores.
          {canCreateStaff ? " Crealo desde Personal para darle su acceso propio." : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeRows.map((p) => {
            const busy = pendingIds.has(p.id)
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground">
                    {p.name}
                  </p>
                  {p.phone ? (
                    <span className="text-[12px] text-white/40">{p.phone}</span>
                  ) : null}
                </div>

                {!canManage ? (
                  <span className="text-[13px] text-white/45">activo</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleActive(p)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${p.isActive ? "border-white/[0.12] bg-white/[0.06] text-foreground" : "border-white/[0.08] text-white/40"} ${busy ? "opacity-50" : ""}`}
                    >
                      {p.isActive ? "Activo" : "Inactivo"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(p)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      aria-label={`Editar a ${p.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(p)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Quitar a ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {inactiveCount > 0 ? (
            <p className="pt-1 text-[12px] text-white/35">
              {inactiveCount} promotor{inactiveCount === 1 ? "" : "es"} inactivo
              {inactiveCount === 1 ? "" : "s"} (sus ventas históricas se mantienen).
            </p>
          ) : null}
        </div>
      )}

      {canManage ? <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl border-white/[0.1] bg-black p-0 text-white">
          <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left">
            <DialogTitle className="text-xl">{editing ? "Editar promotor" : "Nuevo promotor"}</DialogTitle>
            <DialogDescription className="mt-1 text-white/45">Los promotores quedan disponibles para atribuir ventas en todos los eventos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <label className="block space-y-1.5"><span className="text-sm font-medium text-white/70">Nombre</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Carla Fernández" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void save() }} className="border-white/[0.1] bg-white/[0.04]" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium text-white/70">Teléfono</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 5555 5555" inputMode="tel" className="border-white/[0.1] bg-white/[0.04]" /></label>
            <Button type="button" onClick={() => void save()} disabled={saving || !name.trim()} className="w-full bg-[#FF9500] text-white hover:bg-[#FF9500]/90">{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear promotor"}</Button>
          </div>
        </DialogContent>
      </Dialog> : null}
    </div>
  )
}
