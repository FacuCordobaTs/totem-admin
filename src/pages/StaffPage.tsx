import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile, type StaffRole } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { MoreHorizontal, UserPlus } from "lucide-react"

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
  const [createName, setCreateName] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState<StaffRole>("BARTENDER")
  const [createError, setCreateError] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState(false)

  const [editing, setEditing] = useState<StaffProfile | null>(null)
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState<StaffRole>("BARTENDER")
  const [editPassword, setEditPassword] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<StaffProfile | null>(null)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

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

  function resetCreateForm() {
    setCreateName("")
    setCreateEmail("")
    setCreatePassword("")
    setCreateRole("BARTENDER")
    setCreateError(null)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setCreateError(null)
    setCreateLoading(true)
    try {
      await apiFetch<{ staff: StaffProfile }>("/staff/team", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
        }),
      })
      setCreateOpen(false)
      resetCreateForm()
      await loadTeam()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta")
    } finally {
      setCreateLoading(false)
    }
  }

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
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
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
                  onClick={() => setCreateOpen(true)}
                  className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
                >
                  <UserPlus className="h-4 w-4" />
                  Agregar
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

          <div className="overflow-hidden rounded-2xl bg-background">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                  <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Nombre
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Rol
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] md:table-cell dark:text-[#98989D]">
                    Alta
                  </TableHead>
                  {isAdmin ? (
                    <TableHead className="w-12 pr-4 text-right" />
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={isAdmin ? 4 : 3}
                      className="py-10 text-[#8E8E93] dark:text-[#98989D]"
                    >
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={isAdmin ? 4 : 3}
                      className="py-10 text-[#8E8E93] dark:text-[#98989D]"
                    >
                      {showInactive ? "Sin registros." : "Sin personas activas."}
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m) => {
                    const inactive = m.isActive === false
                    return (
                      <TableRow
                        key={m.id}
                        className={cnRow(inactive)}
                      >
                        <TableCell className="pl-6 py-3.5">
                          <span className="font-semibold text-foreground">{m.name}</span>
                          {inactive ? (
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                              Inactiva
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3.5 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                          {staffRoleLabel(m.role)}
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-[15px] text-[#8E8E93] md:table-cell dark:text-[#98989D]">
                          {formatDateShort(m.createdAt)}
                        </TableCell>
                        {isAdmin ? (
                          <TableCell className="pr-4 py-3.5 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-xl text-[#8E8E93] dark:text-[#98989D]"
                                  aria-label={`Acciones · ${m.name}`}
                                >
                                  <MoreHorizontal className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                                <DropdownMenuItem
                                  className="rounded-lg text-[15px]"
                                  disabled={inactive}
                                  onSelect={() => openEdit(m)}
                                >
                                  Editar
                                </DropdownMenuItem>
                                {inactive ? (
                                  <DropdownMenuItem
                                    className="rounded-lg text-[15px]"
                                    onSelect={() => void reactivateMember(m)}
                                  >
                                    Reactivar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="rounded-lg text-[15px] text-red-600 focus:text-red-600 dark:text-red-400"
                                    disabled={m.id === current?.id}
                                    onSelect={() => {
                                      setDeactivateError(null)
                                      setDeactivateTarget(m)
                                    }}
                                  >
                                    Desactivar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) resetCreateForm()
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-zinc-200/50 dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Nueva cuenta
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8E8E93] dark:text-[#98989D]">
              Correo y contraseña para iniciar sesión.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="flex flex-col gap-4">
            {createError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="st-name" className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                Nombre
              </label>
              <Input
                id="st-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="st-email" className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                Correo
              </label>
              <Input
                id="st-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                autoComplete="off"
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="st-pass" className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                Contraseña inicial
              </label>
              <Input
                id="st-pass"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
              />
            </div>
            <div className="space-y-2">
              <span className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Rol</span>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as StaffRole)}>
                <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black">
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
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading} className="rounded-xl bg-[#FF9500] font-semibold text-white hover:bg-[#FF9500]/90">
                {createLoading ? "Creando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md rounded-2xl border-zinc-200/50 dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">Editar</DialogTitle>
            <DialogDescription className="text-sm text-[#8E8E93] dark:text-[#98989D]">
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
                  className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                />
              </div>
              <div className="space-y-2">
                <span className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Rol</span>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as StaffRole)}>
                  <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black">
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
                  className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                />
              </div>
              <DialogFooter className="gap-2">
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

      <Dialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl border-zinc-200/50 dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Desactivar acceso
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8E8E93] dark:text-[#98989D]">
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

function cnRow(inactive: boolean): string {
  return inactive
    ? "border-0 opacity-70 hover:bg-transparent"
    : "border-0 transition-colors hover:bg-[#F2F2F7]/80 dark:hover:bg-zinc-800/30"
}
