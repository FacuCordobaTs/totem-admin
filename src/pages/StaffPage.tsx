import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ChevronLeft, Plus } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile, type StaffRole } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { StaffInlineCreate } from "@/components/staff/staff-inline-create"

const ROLES: StaffRole[] = ["ADMIN", "MANAGER", "BARTENDER", "SECURITY"]

type TeamResponse = { staff: StaffProfile[] }

function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function StaffPage() {
  const token = useAuthStore((s) => s.token)
  const current = useAuthStore((s) => s.staff)
  const isAdmin = current?.role === "ADMIN"

  const [members, setMembers] = useState<StaffProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const [editing, setEditing] = useState<StaffProfile | null>(null)
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState<StaffRole>("BARTENDER")
  const [editPassword, setEditPassword] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<StaffProfile | null>(null)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const [searchParams] = useSearchParams()
  const fromEventId = searchParams.get("from")
  const backHref = fromEventId ? `/eventos/${fromEventId}#personal` : "/eventos"
  const backLabel = fromEventId ? "Volver al evento" : "Volver a eventos"

  const loadTeam = useCallback(async () => {
    if (!token) return
    setListError(null)
    setLoading(true)
    try {
      const q = isAdmin && showInactive ? "?includeInactive=true" : ""
      const data = await apiFetch<TeamResponse>(`/staff/team${q}`, {
        method: "GET",
        token,
      })
      setMembers(data.staff)
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "No se pudo cargar el equipo")
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, showInactive])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  const membersByRole = useMemo(
    () => ROLES.map((role) => ({
      role,
      members: members.filter((member) => member.role === role),
    })).filter((group) => group.members.length > 0),
    [members]
  )

  function openEdit(member: StaffProfile) {
    setEditing(member)
    setEditName(member.name)
    setEditRole(member.role)
    setEditPassword("")
    setEditError(null)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !editing) return
    setEditError(null)
    setEditLoading(true)
    try {
      const body: { name?: string; role?: StaffRole; password?: string } = {
        name: editName,
        role: editRole,
      }
      if (editPassword.trim().length > 0) {
        body.password = editPassword
      }
      await apiFetch<{ staff: StaffProfile }>(`/staff/team/${editing.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      })
      setEditing(null)
      await loadTeam()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setEditLoading(false)
    }
  }

  async function reactivateMember(member: StaffProfile) {
    if (!token) return
    setListError(null)
    try {
      await apiFetch(`/staff/team/${member.id}/reactivate`, {
        method: "POST",
        token,
      })
      await loadTeam()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "No se pudo reactivar")
    }
  }

  async function confirmDeactivate() {
    if (!token || !deactivateTarget) return
    setDeactivateError(null)
    setDeactivateLoading(true)
    try {
      await apiFetch(`/staff/team/${deactivateTarget.id}`, {
        method: "DELETE",
        token,
      })
      setDeactivateTarget(null)
      await loadTeam()
    } catch (err) {
      setDeactivateError(
        err instanceof ApiError ? err.message : "No se pudo desactivar"
      )
    } finally {
      setDeactivateLoading(false)
    }
  }

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
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] dark:text-[#98989D]">
                Staff global
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Personal
              </h1>
              <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                Equipo y accesos.
              </p>
            </div>
            {isAdmin ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
                  onClick={() => setShowInactive((v) => !v)}
                >
                  {showInactive ? "Solo activos" : "Incluir inactivos"}
                </Button>
                <Button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="h-10 rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar staff
                </Button>
              </div>
            ) : null}
          </div>

          {!isAdmin ? (
            <p className="mb-6 rounded-2xl bg-background px-5 py-4 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Solo administradores pueden crear o modificar cuentas.
            </p>
          ) : null}

          {listError ? (
            <p className="mb-6 text-[15px] text-red-600 dark:text-red-400" role="alert">
              {listError}
            </p>
          ) : null}

          {loading ? (
            <div className="rounded-2xl bg-background px-6 py-10 text-[15px] text-[#8E8E93] dark:text-[#98989D]">Cargando…</div>
          ) : membersByRole.length === 0 ? (
            <div className="rounded-2xl bg-background px-6 py-10 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              {showInactive ? "Sin registros." : "Sin personas activas."}
            </div>
          ) : (
            <div className="space-y-6">
              {membersByRole.map((group) => (
                <section key={group.role}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8E8E93] dark:text-[#98989D]">
                    {staffRoleLabel(group.role)} · {group.members.length}
                  </p>
                  <div className="overflow-hidden rounded-2xl bg-background">
                    {group.members.map((member, index) => {
                      const inactive = member.isActive === false
                      const content = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">{member.name}</p>
                            <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">Alta {formatDateShort(member.createdAt)}</p>
                          </div>
                          {inactive ? <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Inactiva</span> : null}
                        </>
                      )
                      const className = `flex w-full items-center gap-4 px-6 py-4 text-left ${index > 0 ? "border-t border-zinc-200/50 dark:border-zinc-800/50" : ""} ${inactive ? "opacity-70" : ""}`
                      return isAdmin ? (
                        <button key={member.id} type="button" onClick={() => openEdit(member)} className={`${className} transition-colors hover:bg-[#F2F2F7]/80 dark:hover:bg-zinc-800/30`}>
                          {content}
                        </button>
                      ) : (
                        <div key={member.id} className={className}>{content}</div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md rounded-2xl border-white/[0.1] bg-black text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">Editar</DialogTitle>
            <DialogDescription className="text-sm text-white/45">
              {editing?.email}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form onSubmit={submitEdit} className="flex flex-col gap-4">
              {editError ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {editError}
                </p>
              ) : null}
              <div className="space-y-2">
                <label htmlFor="ed-name" className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                  Nombre
                </label>
                <Input
                  id="ed-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-white/[0.12] bg-white/[0.04] text-white"
                />
              </div>
              <div className="space-y-2">
                <span className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Rol</span>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as StaffRole)}>
                  <SelectTrigger className="h-11 rounded-xl border-white/[0.12] bg-white/[0.04] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {staffRoleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="ed-pass" className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                  Nueva contraseña (opcional)
                </label>
                <Input
                  id="ed-pass"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={8}
                  placeholder="Vacío = sin cambios"
                  autoComplete="new-password"
                  className="h-11 rounded-xl border-white/[0.12] bg-white/[0.04] text-white"
                />
              </div>
              <DialogFooter className="gap-2">
                {editing.isActive === false ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mr-auto rounded-xl"
                    onClick={() => {
                      void reactivateMember(editing)
                      setEditing(null)
                    }}
                  >
                    Reactivar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto rounded-xl"
                    disabled={editing.id === current?.id}
                    onClick={() => {
                      setDeactivateError(null)
                      setDeactivateTarget(editing)
                      setEditing(null)
                    }}
                  >
                    Desactivar
                  </Button>
                )}
                <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editLoading} className="rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90">
                  {editLoading ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl border-white/[0.1] bg-black text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">Agregar staff</DialogTitle>
            <DialogDescription className="text-sm text-white/45">
              Creá una cuenta para sumarla al equipo global.
            </DialogDescription>
          </DialogHeader>
          <StaffInlineCreate
            onCreated={() => {
              setCreateOpen(false)
              void loadTeam()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl border-white/[0.1] bg-black text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Desactivar acceso
            </DialogTitle>
            <DialogDescription className="text-sm text-white/45">
              {deactivateTarget
                ? `${deactivateTarget.name} no podrá iniciar sesión.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deactivateError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {deactivateError}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setDeactivateTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={deactivateLoading}
              onClick={() => void confirmDeactivate()}
            >
              {deactivateLoading ? "Procesando…" : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
