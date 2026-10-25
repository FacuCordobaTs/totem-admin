import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventAssignmentStaffRow,
  EventBarRow,
  EventBarsResponse,
  EventStaffListResponse
} from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { getPromoterEventShopUrl } from "@/lib/client-app-url"
import { RoleCheckboxes } from "@/components/staff/role-checkboxes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

type StaffRole = EventAssignmentStaffRow["role"]
type Invitation = {
  id: string
  name: string
  role: StaffRole
  roles?: StaffRole[]
  url: string
  acceptedStaffId: string | null
}
type InvitationsResponse = { invitations: Invitation[] }
type AssignmentFilter = "assigned" | "available" | "all"
const ROLE_ORDER: StaffRole[] = [
  "MANAGER",
  "PROMOTER",
  "GENERAL_PROMOTER",
  "BARTENDER",
  "SECURITY",
  "TRANSPORTER",
  "ADMIN"
]
const memberRoles = (member: EventAssignmentStaffRow) =>
  member.roles ?? [member.role]
const isPromoter = (member: EventAssignmentStaffRow) =>
  memberRoles(member).some(
    (role) => role === "PROMOTER" || role === "GENERAL_PROMOTER"
  )
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()

type Props = {
  eventId: string
  /** Slug público cuando existe; el id sigue funcionando como fallback. */
  eventLinkId?: string
  inviteAccessHint?: string
  /** En eventos de solo entradas no se configura la barra. */
  promotersOnly?: boolean
  onTeamChange?: () => void
}

export function EventStaffTab({
  eventId,
  eventLinkId,
  inviteAccessHint,
  promotersOnly = false,
  onTeamChange
}: Props) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const currentStaffId = useAuthStore((s) => s.staff?.id)
  const isGeneralPromoter = role === "GENERAL_PROMOTER"
  const canEditRoles = role === "ADMIN" || role === "MANAGER"
  const canManage = canEditRoles || isGeneralPromoter
  const showBars = !isGeneralPromoter && !promotersOnly
  const [rows, setRows] = useState<EventAssignmentStaffRow[]>([])
  const [bars, setBars] = useState<EventBarRow[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filterId = useId()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [promoterFilter, setPromoterFilter] = useState("all")
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("assigned")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitationToShow, setInvitationToShow] = useState<Invitation | null>(
    null
  )
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [memberToDelete, setMemberToDelete] =
    useState<EventAssignmentStaffRow | null>(null)
  const [deletingMember, setDeletingMember] = useState(false)
  const [editingRoles, setEditingRoles] =
    useState<EventAssignmentStaffRow | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<StaffRole[]>([])
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)

  const load = useCallback(
    async (showLoading = false) => {
      if (!token) return
      if (showLoading) setLoading(true)
      setError(null)
      try {
        const [staffData, invitationsData, barsData] = await Promise.all([
          apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, {
            token
          }),
          canManage
            ? apiFetch<InvitationsResponse>("/staff/invitations", { token })
            : Promise.resolve(null),
          showBars
            ? apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, { token })
            : Promise.resolve(null)
        ])
        setRows(staffData.staff)
        setInvitations(invitationsData?.invitations ?? [])
        setBars(barsData?.bars.filter((bar) => bar.isActive !== false) ?? [])
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : "No se pudo cargar el equipo del evento"
        )
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [canManage, eventId, showBars, token]
  )
  useEffect(() => {
    void load(true)
  }, [load])

  const reloadTeam = useCallback(() => {
    void load()
    onTeamChange?.()
  }, [load, onTeamChange])
  const invitationsByStaffId = useMemo(
    () =>
      new Map(
        invitations
          .filter((invitation) => invitation.acceptedStaffId != null)
          .map((invitation) => [invitation.acceptedStaffId!, invitation])
      ),
    [invitations]
  )
  const team = useMemo(
    () =>
      rows
        .filter(
          (member) =>
            !isGeneralPromoter || memberRoles(member).includes("PROMOTER")
        )
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [rows, isGeneralPromoter]
  )
  const generalPromoters = team.filter((member) =>
    memberRoles(member).includes("GENERAL_PROMOTER")
  )
  const selectedGeneralPromoter = generalPromoters.find(
    (member) => member.id === promoterFilter
  )
  const assignedCount = team.filter((member) => member.isAssigned).length
  const availableCount = team.length - assignedCount
  const filterCount =
    Number(roleFilter !== "all") + Number(promoterFilter !== "all")
  const hasFilters = !!query || filterCount > 0
  const filteredRows = team.filter((member) => {
    if (assignmentFilter === "assigned" && !member.isAssigned) return false
    if (assignmentFilter === "available" && member.isAssigned) return false
    if (
      roleFilter !== "all" &&
      !memberRoles(member).includes(roleFilter as StaffRole)
    )
      return false
    if (
      promoterFilter !== "all" &&
      (!selectedGeneralPromoter ||
        (member.id !== selectedGeneralPromoter.id &&
          member.generalPromoterName !== selectedGeneralPromoter.name))
    )
      return false
    return normalize(member.name).includes(normalize(query))
  })

  function clearFilters() {
    setQuery("")
    setRoleFilter("all")
    setPromoterFilter("all")
  }

  async function setAssignment(
    member: EventAssignmentStaffRow,
    isAssigned: boolean,
    barId?: string | null
  ) {
    if (!token || pendingIds.has(member.id)) return
    setPendingIds((ids) => new Set(ids).add(member.id))
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({
          staffId: member.id,
          isAssigned,
          ...(isAssigned && barId !== undefined ? { barId } : {})
        })
      })
      setRows((current) =>
        current.map((row) =>
          row.id === member.id
            ? {
                ...row,
                isAssigned,
                barId: isAssigned
                  ? barId === undefined
                    ? row.barId
                    : barId
                  : null
              }
            : row
        )
      )
      onTeamChange?.()
      toast.success(
        barId !== undefined
          ? "Barra actualizada"
          : isAssigned
            ? `${member.name}: asignación al evento confirmada`
            : `${member.name}: fuera del evento`
      )
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "No se pudo actualizar el equipo. Volvé a intentarlo."
      )
    } finally {
      setPendingIds((ids) => {
        const next = new Set(ids)
        next.delete(member.id)
        return next
      })
    }
  }

  async function saveRoles() {
    if (!token || !editingRoles || savingRoles || selectedRoles.length === 0)
      return
    setSavingRoles(true)
    setRolesError(null)
    try {
      await apiFetch(`/events/${eventId}/staff/${editingRoles.id}/roles`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ roles: selectedRoles })
      })
      setEditingRoles(null)
      await load()
      await useAuthStore.getState().fetchSession()
      onTeamChange?.()
      toast.success("Roles actualizados")
    } catch (err) {
      setRolesError(
        err instanceof Error ? err.message : "No se pudieron guardar los roles."
      )
    } finally {
      setSavingRoles(false)
    }
  }

  async function deleteMember() {
    if (!token || !memberToDelete || deletingMember) return
    setDeletingMember(true)
    try {
      await apiFetch(`/staff/team/${memberToDelete.id}`, {
        method: "DELETE",
        token
      })
      setRows((current) =>
        current.filter((row) => row.id !== memberToDelete.id)
      )
      if (promoterFilter === memberToDelete.id) setPromoterFilter("all")
      setMemberToDelete(null)
      onTeamChange?.()
      toast.success("Empleado eliminado de la productora")
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo eliminar al empleado"
      )
    } finally {
      setDeletingMember(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link de venta copiado")
    } catch {
      toast.error(
        "No se pudo copiar el link. Abrilo desde el menú para compartirlo."
      )
    }
  }

  function renderMemberRow(member: EventAssignmentStaffRow) {
    const busy = pendingIds.has(member.id)
    const invitation = invitationsByStaffId.get(member.id)
    const shopUrl =
      isPromoter(member) && member.promoterId
        ? getPromoterEventShopUrl(eventLinkId ?? eventId, member.promoterId)
        : null
    return (
      <li
        key={member.id}
        aria-busy={busy}
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-5 ${showBars ? "md:grid-cols-[minmax(0,1fr)_180px_120px_40px]" : "md:grid-cols-[minmax(0,1fr)_120px_40px]"}`}
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
          <div
            aria-hidden="true"
            className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-medium text-white/70 sm:flex"
          >
            {member.name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-white/90">
              {member.name}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-white/60">
              {memberRoles(member).map(staffRoleLabel).join(" · ")}
            </p>
            {member.generalPromoterName ? (
              <p className="mt-0.5 break-words text-xs leading-5 text-white/60">
                Promotor general: {member.generalPromoterName}
              </p>
            ) : null}
          </div>
        </div>
        {showBars ? (
          <div
            className={`col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1 ${memberRoles(member).includes("BARTENDER") && member.isAssigned ? "" : "hidden md:block"}`}
          >
            {memberRoles(member).includes("BARTENDER") && member.isAssigned ? (
              canManage ? (
                <Select
                  value={member.barId ?? "unassigned"}
                  onValueChange={(value) =>
                    void setAssignment(
                      member,
                      true,
                      value === "unassigned" ? null : value
                    )
                  }
                  disabled={busy}
                >
                  <SelectTrigger
                    aria-label={`Barra de ${member.name}`}
                    className="h-10 w-full border-white/10 bg-transparent text-xs text-white/70 md:h-9"
                  >
                    <SelectValue placeholder="Sin barra asignada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      Sin barra asignada
                    </SelectItem>
                    {bars.map((bar) => (
                      <SelectItem key={bar.id} value={bar.id}>
                        {bar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-white/60">
                  {bars.find((bar) => bar.id === member.barId)?.name ??
                    "Sin barra asignada"}
                </p>
              )
            ) : (
              <span
                aria-label="No corresponde"
                className="hidden text-xs text-white/50 md:inline"
              >
                —
              </span>
            )}
          </div>
        ) : null}
        <span
          className={`col-start-1 inline-flex w-fit items-center gap-1.5 text-xs md:row-start-1 ${showBars ? "md:col-start-3" : "md:col-start-2"} ${showBars && memberRoles(member).includes("BARTENDER") && member.isAssigned ? "row-start-3" : "row-start-2"} ${member.isAssigned ? "text-emerald-300" : "text-white/60"}`}
        >
          {member.isAssigned ? <Check className="size-3.5" /> : null}
          {member.isAssigned ? "En el evento" : "Disponible"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Acciones de ${member.name}`}
              className={`col-start-2 row-start-1 size-10 text-white/60 hover:bg-white/[0.08] hover:text-white ${showBars ? "md:col-start-4" : "md:col-start-3"}`}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <MoreHorizontal className="size-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="break-words">
              {member.name}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {shopUrl && member.isAssigned ? (
                <>
                  <DropdownMenuItem onSelect={() => void copyLink(shopUrl)}>
                    <Copy />
                    Copiar link de venta
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={shopUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Abrir link de venta
                    </a>
                  </DropdownMenuItem>
                </>
              ) : null}
              {canManage && invitation ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setInvitationToShow(invitation)
                    setInviteOpen(true)
                  }}
                >
                  <Link2 />
                  Compartir acceso
                </DropdownMenuItem>
              ) : null}
              {canEditRoles ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditingRoles(member)
                    setSelectedRoles(memberRoles(member))
                    setRolesError(null)
                  }}
                >
                  <ShieldCheck />
                  Editar roles
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            {canManage ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() =>
                      void setAssignment(member, !member.isAssigned)
                    }
                  >
                    {member.isAssigned ? <UserMinus /> : <UserPlus />}
                    {member.isAssigned
                      ? "Quitar del evento"
                      : "Asignar al evento"}
                  </DropdownMenuItem>
                  {(role === "ADMIN" || isGeneralPromoter) && member.id !== currentStaffId ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setMemberToDelete(member)}
                    >
                      <Trash2 />
                      Eliminar de la productora
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    )
  }

  if (loading)
    return (
      <div role="status" className="space-y-4">
        <span className="sr-only">Cargando equipo…</span>
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-20 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none"
          />
        ))}
      </div>
    )
  if (error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-red-400/20 bg-red-400/5 p-5"
      >
        <p className="text-sm text-red-300">{error}</p>
        <Button variant="outline" onClick={() => void load(true)}>
          Volver a intentar
        </Button>
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {isGeneralPromoter ? "Mis promotores" : "Personas del evento"}
          </h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-white/60">
            {isGeneralPromoter
              ? "Gestioná tu cartera y compartí los accesos desde el menú de cada promotor."
              : "Cada evento nuevo incluye a todo el equipo activo. Las personas que invites acá quedan asignadas a este evento."}
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setInvitationToShow(null)
              setInviteOpen(true)
            }}
            className="h-10 gap-2 self-start rounded-lg bg-[#FF9500] px-4 text-black hover:bg-[#FF9500]/90"
          >
            <UserPlus className="size-4" />
            {isGeneralPromoter ? "Invitar promotor" : "Invitar persona"}
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="space-y-4 border-b border-white/10 p-4 sm:p-5">
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Asignación al evento"
          >
            {(
              [
                {
                  value: "assigned",
                  label: "En el evento",
                  count: assignedCount
                },
                {
                  value: "available",
                  label: "Disponibles",
                  count: availableCount
                },
                { value: "all", label: "Todos", count: team.length }
              ] as const
            ).map((filter) => (
              <Button
                key={filter.value}
                variant="ghost"
                aria-pressed={assignmentFilter === filter.value}
                onClick={() => setAssignmentFilter(filter.value)}
                className={`h-10 gap-2 px-2.5 text-xs sm:px-3 sm:text-sm ${assignmentFilter === filter.value ? "bg-white/10 text-white hover:bg-white/15" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              >
                {filter.label}
                <span
                  className={`tabular-nums ${assignmentFilter === filter.value ? "text-white/80" : "text-white/50"}`}
                >
                  {filter.count}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap">
            <div className="flex min-w-0 gap-2 xl:min-w-60 xl:flex-1">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 size-4 text-white/50"
                />
                <Input
                  aria-label="Buscar personas"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar personas…"
                  className="h-10 border-white/10 bg-white/[0.03] pl-9 pr-10 text-sm placeholder:text-white/50"
                />
                {query ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Borrar búsqueda"
                    onClick={() => setQuery("")}
                    className="absolute right-0 top-0 size-10 text-white/60"
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
              <Button
                variant="outline"
                aria-expanded={filtersOpen}
                aria-controls={filterId}
                onClick={() => setFiltersOpen((open) => !open)}
                className="h-10 gap-2 border-white/10 bg-transparent text-white/80 sm:hidden"
              >
                <SlidersHorizontal className="size-4" />
                Filtros
                {filterCount > 0 ? (
                  <span className="tabular-nums">{filterCount}</span>
                ) : null}
              </Button>
            </div>
            <div
              id={filterId}
              className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid sm:grid-cols-2 xl:flex xl:flex-wrap`}
            >
              {!isGeneralPromoter ? (
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger
                    aria-label="Filtrar por rol"
                    className="h-10 w-full border-white/10 bg-transparent xl:w-44"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    {ROLE_ORDER.filter((role) =>
                      team.some((member) => memberRoles(member).includes(role))
                    ).map((role) => (
                      <SelectItem key={role} value={role}>
                        {staffRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {generalPromoters.length > 0 ? (
                <Select
                  value={promoterFilter}
                  onValueChange={setPromoterFilter}
                >
                  <SelectTrigger
                    aria-label="Filtrar por promotor general"
                    className="h-10 w-full border-white/10 bg-transparent xl:w-60"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los promotores generales</SelectItem>
                    {generalPromoters.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              aria-live="polite"
              role="status"
              className="text-xs text-white/60"
            >
              {filteredRows.length}{" "}
              {filteredRows.length === 1 ? "persona" : "personas"}
              {hasFilters
                ? " con estos filtros"
                : assignmentFilter === "assigned"
                  ? " asignadas al evento"
                  : assignmentFilter === "available"
                    ? " disponibles para asignar"
                    : " en el equipo"}
            </p>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-white/70"
              >
                <X className="size-3.5" />
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </div>

        {filteredRows.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className={`hidden items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs font-medium text-white/60 md:grid ${showBars ? "grid-cols-[minmax(0,1fr)_180px_120px_40px]" : "grid-cols-[minmax(0,1fr)_120px_40px]"}`}
            >
              <span>Persona y funciones</span>
              {showBars ? <span>Barra</span> : null}
              <span>Asignación</span>
              <span className="sr-only">Acciones</span>
            </div>
            <ul
              aria-label={
                isGeneralPromoter ? "Promotores" : "Equipo del evento"
              }
              className="divide-y divide-white/[0.06]"
            >
              {filteredRows.map(renderMemberRow)}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            {hasFilters ? (
              <Search className="mb-3 size-6 text-white/50" />
            ) : (
              <Users className="mb-3 size-6 text-white/50" />
            )}
            <p className="text-sm font-medium text-white/90">
              {hasFilters
                ? "No hay coincidencias"
                : team.length === 0
                  ? "Tu equipo empieza acá"
                  : assignmentFilter === "available"
                    ? "Todo el equipo está en el evento"
                    : "Todavía no hay personas asignadas"}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-white/60">
              {hasFilters
                ? "Probá con otro nombre o limpiá los filtros para ver más personas."
                : team.length === 0
                  ? "Invitá a una persona y compartí su acceso. Quedará asignada a este evento automáticamente."
                  : assignmentFilter === "available"
                    ? "Las personas que quites del evento aparecerán en esta vista."
                    : "Invitá a alguien o asigná personas desde la vista Disponibles."}
            </p>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters} className="mt-5">
                Limpiar filtros
              </Button>
            ) : availableCount > 0 && assignmentFilter === "assigned" ? (
              <Button
                variant="outline"
                onClick={() => setAssignmentFilter("available")}
                className="mt-5"
              >
                Ver personas disponibles
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {canManage ? (
        <InviteEmployeeDialog
          eventId={eventId}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onCreated={() => {
            clearFilters()
            setAssignmentFilter("assigned")
            reloadTeam()
          }}
          accessHint={inviteAccessHint}
          initialInvitation={invitationToShow}
          promoterOnly={isGeneralPromoter}
          ticketsOnly={promotersOnly}
        />
      ) : null}
      <Dialog
        open={editingRoles !== null}
        onOpenChange={(open) => {
          if (!open && !savingRoles) setEditingRoles(null)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Roles de {editingRoles?.name}</DialogTitle>
            <DialogDescription>
              Elegí las funciones de esta persona en la productora.
              Administrador y gerente permiten gestionar la productora. La
              asignación al evento se conserva.
            </DialogDescription>
          </DialogHeader>
          <RoleCheckboxes
            roles={selectedRoles}
            onChange={setSelectedRoles}
            disabled={savingRoles}
          />
          {rolesError ? (
            <p role="alert" className="text-sm text-red-400">
              {rolesError}
            </p>
          ) : null}
          <Button
            disabled={savingRoles || selectedRoles.length === 0}
            onClick={() => void saveRoles()}
          >
            {savingRoles ? "Guardando…" : "Guardar roles"}
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={memberToDelete != null}
        onOpenChange={(open) =>
          !open && !deletingMember && setMemberToDelete(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar a {memberToDelete?.name} de la productora?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta persona desaparecerá del equipo de todos los eventos y perderá
              el acceso a la productora. Sus ventas y registros históricos se
              conservan. Para quitarla solo de este evento, usá «Quitar del evento».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMember}>
              Cancelar
            </AlertDialogCancel>
            <Button
              disabled={deletingMember}
              onClick={() => void deleteMember()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {deletingMember ? "Eliminando…" : "Eliminar de la productora"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function InviteEmployeeDialog({
  eventId,
  open,
  onOpenChange,
  onCreated,
  accessHint,
  initialInvitation,
  promoterOnly = false,
  ticketsOnly = false
}: {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  accessHint?: string
  initialInvitation: Invitation | null
  promoterOnly?: boolean
  ticketsOnly?: boolean
}) {
  const token = useAuthStore((s) => s.token)
  const [name, setName] = useState("")
  const [role, setRole] = useState<StaffRole>(
    promoterOnly ? "PROMOTER" : ticketsOnly ? "TRANSPORTER" : "BARTENDER"
  )
  const [roles, setRoles] = useState<StaffRole[]>([
    promoterOnly ? "PROMOTER" : ticketsOnly ? "TRANSPORTER" : "BARTENDER"
  ])
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setInvitation(initialInvitation)
      setError(null)
    }
  }, [initialInvitation, open])

  function close(nextOpen: boolean) {
    if (saving) return
    if (!nextOpen) {
      setInvitation(null)
      setError(null)
      setName("")
      setRole(
        promoterOnly ? "PROMOTER" : ticketsOnly ? "TRANSPORTER" : "BARTENDER"
      )
      setRoles([
        promoterOnly ? "PROMOTER" : ticketsOnly ? "TRANSPORTER" : "BARTENDER"
      ])
    }
    onOpenChange(nextOpen)
  }

  async function create() {
    if (!token || saving) return
    if (!name.trim()) return setError("Completá el nombre de la persona.")
    if (roles.length === 0) return setError("Elegí al menos un rol.")
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<{ invitation: Invitation }>(
        "/staff/invitations",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            name: name.trim(),
            role: roles.includes(role) ? role : roles[0],
            roles,
            eventId
          })
        }
      )
      setInvitation(data.invitation)
      onCreated()
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo crear la invitación"
      )
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    if (!invitation) return
    try {
      await navigator.clipboard.writeText(invitation.url)
      toast.success("Link de acceso copiado")
    } catch {
      toast.error(
        "No se pudo copiar el link. Seleccionalo para copiarlo manualmente."
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-white/[0.1] bg-black p-0 text-white sm:max-w-lg">
        <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left">
          <DialogTitle className="text-xl">
            {invitation
              ? "Compartir acceso"
              : promoterOnly
                ? "Invitar promotor"
                : "Invitar persona"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-white/60">
            {invitation
              ? "Compartí este enlace o QR para que la persona entre a Crow."
              : "La persona queda asignada automáticamente a este evento."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          {invitation ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
              <p className="font-medium text-emerald-300">Link de invitación</p>
              <p className="mt-1 text-sm text-white/65">
                {invitation.name} ·{" "}
                {(invitation.roles ?? [invitation.role])
                  .map(staffRoleLabel)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-col items-center gap-4">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG
                    value={invitation.url}
                    size={144}
                    level="M"
                    includeMargin
                  />
                </div>
                <div className="min-w-0 self-stretch">
                  <p className="text-sm text-white/65">
                    {accessHint ?? "Escaneá el QR para abrir la invitación."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Input
                      aria-label="Link de acceso"
                      readOnly
                      value={invitation.url}
                      className="h-10 min-w-0 border-white/[0.1] bg-black text-xs text-white/65"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void copy()}
                      aria-label="Copiar link de invitación"
                      className="shrink-0 border-white/[0.12] bg-transparent"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <Field
                label={
                  promoterOnly ? "Nombre del promotor" : "Nombre y apellido"
                }
              >
                <Input
                  disabled={saving}
                  maxLength={100}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nombre y apellido"
                  className="border-white/[0.1] bg-white/[0.04]"
                />
              </Field>
              {!promoterOnly ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white/70">Roles</p>
                  <RoleCheckboxes
                    roles={roles}
                    onChange={setRoles}
                    disabled={saving}
                  />
                  <p className="text-xs text-white/60">
                    Podés elegir varias funciones. Administrador y gerente dan
                    acceso a la gestión de la productora.
                  </p>
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={saving}
                className="h-10 w-full bg-[#FF9500] text-black hover:bg-[#FF9500]/90"
              >
                {saving ? "Creando…" : "Crear invitación"}
              </Button>
            </form>
          )}
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white/70">{label}</span>
      {children}
    </label>
  )
}
