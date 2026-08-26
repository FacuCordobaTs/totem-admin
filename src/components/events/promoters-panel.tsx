import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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

  const [rows, setRows] = useState<ApiPromoter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  // Alta y edición comparten el mismo formulario inline (editingId null = alta).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)

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

  function startCreate() {
    setEditingId(null)
    setName("")
    setPhone("")
  }

  function startEdit(p: ApiPromoter) {
    setEditingId(p.id)
    setName(p.name)
    setPhone(p.phone ?? "")
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
      startCreate()
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
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startCreate}
            className="h-9 gap-1.5 rounded-xl text-[13px] font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo promotor
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
          {canManage ? " Cargá el primero con el botón de arriba." : null}
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
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                        p.isActive
                          ? "border-white/[0.12] bg-white/[0.06] text-foreground"
                          : "border-white/[0.08] text-white/40",
                        busy && "opacity-50"
                      )}
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

      {canManage && editing ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[14px] font-semibold text-foreground">
              {editingId == null ? "Nuevo promotor" : "Editar promotor"}
            </p>
            <button
              type="button"
              onClick={startCreate}
              className="text-[13px] text-white/40 transition-colors hover:text-white/70"
            >
              Cancelar
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Carla Fernández)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() !== "") void save()
              }}
              className="h-10 rounded-xl border-white/[0.1] bg-white/[0.05] text-[14px] placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono (opcional)"
              inputMode="tel"
              className="h-10 rounded-xl border-white/[0.1] bg-white/[0.05] text-[14px] placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
            />
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || name.trim() === ""}
              className="h-10 rounded-xl bg-[#FF9500] text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
