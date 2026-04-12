import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile, type StaffRole } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { Pencil, UserCheck, UserPlus, UserX } from "lucide-react"

const ROLES: StaffRole[] = ["ADMIN", "MANAGER", "BARTENDER", "SECURITY"]

type TeamResponse = { staff: StaffProfile[] }

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })
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
      const q =
        isAdmin && showInactive ? "?includeInactive=true" : ""
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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Personal</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Gestioná cuentas del equipo. Cada persona puede iniciar sesión en el panel
                con su correo y contraseña.
              </p>
            </div>
            {isAdmin ? (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant={showInactive ? "secondary" : "outline"}
                  onClick={() => setShowInactive((v) => !v)}
                  className="whitespace-nowrap"
                >
                  {showInactive ? "Solo activos" : "Incluir desactivados"}
                </Button>
                <Button onClick={() => setCreateOpen(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Agregar persona
                </Button>
              </div>
            ) : null}
          </div>

          {!isAdmin ? (
            <p className="mb-4 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              Solo los administradores pueden crear o modificar cuentas. Podés ver el listado
              de tu organización.
            </p>
          ) : null}

          {listError ? (
            <p
              className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {listError}
            </p>
          ) : null}

          <div className="rounded-xl border border-border bg-card ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="hidden md:table-cell">Alta</TableHead>
                  {isAdmin ? <TableHead className="w-[140px] text-right">Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-muted-foreground">
                      {showInactive
                        ? "No hay registros en tu espacio."
                        : "No hay personas activas en tu espacio todavía."}
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m) => {
                    const inactive = m.isActive === false
                    return (
                      <TableRow
                        key={m.id}
                        className={inactive ? "opacity-70" : undefined}
                      >
                        <TableCell className="font-medium">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {m.name}
                            {inactive ? (
                              <Badge variant="destructive">Desactivada</Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{staffRoleLabel(m.role)}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDate(m.createdAt)}
                        </TableCell>
                        {isAdmin ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {inactive ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-primary"
                                  onClick={() => void reactivateMember(m)}
                                  title="Reactivar acceso"
                                >
                                  <UserCheck className="h-4 w-4" />
                                  <span className="sr-only">Reactivar {m.name}</span>
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => openEdit(m)}
                                disabled={m.id === current?.id}
                                title={
                                  m.id === current?.id
                                    ? "Editá tu perfil desde Ajustes"
                                    : "Editar"
                                }
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Editar {m.name}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setDeactivateError(null)
                                  setDeactivateTarget(m)
                                }}
                                disabled={inactive || m.id === current?.id}
                                title={
                                  m.id === current?.id
                                    ? "No podés desactivarte desde aquí"
                                    : inactive
                                      ? "Ya desactivada"
                                      : "Desactivar acceso"
                                }
                              >
                                <UserX className="h-4 w-4" />
                                <span className="sr-only">Desactivar {m.name}</span>
                              </Button>
                            </div>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva cuenta</DialogTitle>
            <DialogDescription>
              La persona podrá iniciar sesión en este panel con el correo y la contraseña que
              definás.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="flex flex-col gap-4">
            {createError ? (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="st-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="st-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="st-email" className="text-sm font-medium">
                Correo
              </label>
              <Input
                id="st-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                autoComplete="off"
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="st-pass" className="text-sm font-medium">
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
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Rol</span>
              <Select
                value={createRole}
                onValueChange={(v) => setCreateRole(v as StaffRole)}
              >
                <SelectTrigger className="w-full border-border bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {staffRoleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creando…" : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar persona</DialogTitle>
            <DialogDescription>
              Actualizá datos o asigná una nueva contraseña (opcional).
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form onSubmit={submitEdit} className="flex flex-col gap-4">
              {editError ? (
                <p className="text-sm text-destructive" role="alert">
                  {editError}
                </p>
              ) : null}
              <div className="space-y-2">
                <label htmlFor="ed-name" className="text-sm font-medium">
                  Nombre
                </label>
                <Input
                  id="ed-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Rol</span>
                <Select
                  value={editRole}
                  onValueChange={(v) => setEditRole(v as StaffRole)}
                >
                  <SelectTrigger className="w-full border-border bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {staffRoleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="ed-pass" className="text-sm font-medium">
                  Nueva contraseña (opcional)
                </label>
                <Input
                  id="ed-pass"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={8}
                  placeholder="Dejar vacío para no cambiar"
                  autoComplete="new-password"
                  className="bg-secondary/50"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desactivar acceso</DialogTitle>
            <DialogDescription>
              {deactivateTarget
                ? `${deactivateTarget.name} no podrá iniciar sesión en Totem. Podés reactivarla desde esta misma pantalla (Incluir desactivados).`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deactivateError ? (
            <p className="text-sm text-destructive" role="alert">
              {deactivateError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
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
