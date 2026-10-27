import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { useEventNestedView } from "./event-mobile-nav"

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

const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const tableHeadClass = "text-[11px] font-normal lowercase text-white/45"

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
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
  const selectedMember = useMemo(
    () => team.find((member) => member.id === selectedId) ?? null,
    [team, selectedId]
  )
  useEventNestedView(selectedMember !== null)
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

  async function saveRoles(
    member: EventAssignmentStaffRow,
    roles: StaffRole[]
  ) {
    if (!token || roles.length === 0) return
    await apiFetch(`/events/${eventId}/staff/${member.id}/roles`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ roles })
    })
    await load()
    await useAuthStore.getState().fetchSession()
    onTeamChange?.()
    toast.success("Roles actualizados")
  }

  async function deleteMember(member: EventAssignmentStaffRow): Promise<boolean> {
    if (!token) return false
    try {
      await apiFetch(`/staff/team/${member.id}`, {
        method: "DELETE",
        token
      })
      setRows((current) => current.filter((row) => row.id !== member.id))
      if (promoterFilter === member.id) setPromoterFilter("all")
      if (selectedId === member.id) setSelectedId(null)
      onTeamChange?.()
      toast.success("Empleado eliminado de la productora")
      return true
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo eliminar al empleado"
      )
      return false
    }
  }

  async function copyLink(url: string, successMessage = "Link copiado") {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(successMessage)
    } catch {
      toast.error(
        "No se pudo copiar el link. Abrilo desde el botón para compartirlo."
      )
    }
  }

  if (loading)
    return (
      <div role="status" className="space-y-4">
        <span className="sr-only">Cargando equipo…</span>
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-14 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none"
          />
        ))}
      </div>
    )
  if (error)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-[14px] text-rose-300">{error}</p>
        <Button
          variant="ghost"
          onClick={() => void load(true)}
          className="h-10 rounded-xl bg-white/[0.06] px-4 text-white/80 hover:bg-white/[0.1] hover:text-white"
        >
          Volver a intentar
        </Button>
      </div>
    )

  const inviteDialog = canManage ? (
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
  ) : null

  if (selectedMember) {
    const invitation = invitationsByStaffId.get(selectedMember.id)
    const shopUrl =
      isPromoter(selectedMember) && selectedMember.promoterId
        ? getPromoterEventShopUrl(
            eventLinkId ?? eventId,
            selectedMember.promoterId
          )
        : null
    const canDelete =
      (role === "ADMIN" || isGeneralPromoter) &&
      selectedMember.id !== currentStaffId
    return (
      <>
        <StaffDetail
          key={selectedMember.id}
          member={selectedMember}
          invitation={invitation}
          bars={bars}
          showBars={showBars}
          canManage={canManage}
          canEditRoles={canEditRoles}
          canDelete={canDelete}
          isGeneralPromoter={isGeneralPromoter}
          isPending={pendingIds.has(selectedMember.id)}
          shopUrl={shopUrl}
          backLabel={isGeneralPromoter ? "Promotores" : "Equipo"}
          onBack={() => setSelectedId(null)}
          onToggleAssignment={() =>
            void setAssignment(selectedMember, !selectedMember.isAssigned)
          }
          onBarChange={(barId) => void setAssignment(selectedMember, true, barId)}
          onCopyLink={copyLink}
          onShowAccess={() => {
            setInvitationToShow(invitation ?? null)
            setInviteOpen(true)
          }}
          onSaveRoles={(roles) => saveRoles(selectedMember, roles)}
          onDelete={() => deleteMember(selectedMember)}
        />
        {inviteDialog}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {isGeneralPromoter ? "Mis promotores" : "Personas del evento"}
          </h2>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-white/45">
            {isGeneralPromoter
              ? "Gestioná tu cartera y compartí los accesos desde el detalle de cada promotor."
              : "Cada evento nuevo incluye a todo el equipo activo. Las personas que invites acá quedan asignadas a este evento."}
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setInvitationToShow(null)
              setInviteOpen(true)
            }}
            className={`${primaryButtonClass} self-start`}
          >
            <UserPlus className="mr-1.5 size-4" />
            {isGeneralPromoter ? "Invitar promotor" : "Invitar persona"}
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
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
              className={`h-9 gap-2 rounded-xl px-2.5 text-[13px] ${assignmentFilter === filter.value ? "bg-white/10 text-white hover:bg-white/15" : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}
            >
              {filter.label}
              <span
                className={`tabular-nums ${assignmentFilter === filter.value ? "text-white/80" : "text-white/45"}`}
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
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30"
              />
              <Input
                aria-label="Buscar personas"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar personas…"
                className="h-9 rounded-xl border-0 bg-white/[0.06] pl-8 pr-10 text-[13px] shadow-none placeholder:text-white/25 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"
              />
              {query ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Borrar búsqueda"
                  onClick={() => setQuery("")}
                  className="absolute right-0 top-0 size-9 text-white/60"
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
              className="h-9 rounded-xl border-white/[0.12] bg-transparent px-3 text-[13px] text-white/70 sm:hidden"
            >
              <SlidersHorizontal className="mr-1.5 size-4" />
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
                  className="h-9 w-full rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none xl:w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
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
              <Select value={promoterFilter} onValueChange={setPromoterFilter}>
                <SelectTrigger
                  aria-label="Filtrar por promotor general"
                  className="h-9 w-full rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none xl:w-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
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
          <p aria-live="polite" role="status" className="text-[12px] text-white/45">
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
              className="text-[12px] text-white/60 hover:text-white"
            >
              <X className="size-3.5" />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {filteredRows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table className="table-fixed md:table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className={`w-[52%] pl-4 md:w-auto ${tableHeadClass}`}>
                  Persona
                </TableHead>
                {showBars ? (
                  <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                    Barra
                  </TableHead>
                ) : null}
                <TableHead className={tableHeadClass}>Estado</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Abrir persona</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {filteredRows.map((member) => {
                const busy = pendingIds.has(member.id)
                const memberRoleLabels = memberRoles(member)
                  .map(staffRoleLabel)
                  .join(" · ")
                const barName =
                  memberRoles(member).includes("BARTENDER") && member.isAssigned
                    ? bars.find((bar) => bar.id === member.barId)?.name ??
                      "Sin barra"
                    : "—"
                return (
                  <TableRow
                    key={member.id}
                    aria-busy={busy}
                    tabIndex={0}
                    aria-label={`Abrir a ${member.name}`}
                    onClick={() => {
                      setSelectedId(member.id)
                      window.scrollTo({ top: 0, behavior: "auto" })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelectedId(member.id)
                      }
                    }}
                    className="cursor-pointer border-0 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]"
                  >
                    <TableCell className="py-3.5 pl-4">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span
                          className="truncate text-[15px] font-medium text-white"
                          title={member.name}
                        >
                          {member.name}
                        </span>
                        <span className="hidden min-w-0 truncate text-[12px] text-white/35 sm:inline">
                          {memberRoleLabels}
                        </span>
                      </div>
                    </TableCell>
                    {showBars ? (
                      <TableCell className="hidden py-3.5 text-[13px] text-white/45 md:table-cell">
                        <div className="truncate">{barName}</div>
                      </TableCell>
                    ) : null}
                    <TableCell
                      className={`py-3.5 text-[12px] ${member.isAssigned ? "text-emerald-300/85" : "text-white/45"}`}
                    >
                      {member.isAssigned ? "En el evento" : "Disponible"}
                    </TableCell>
                    <TableCell className="py-3.5 pr-4">
                      {busy ? (
                        <Loader2 className="ml-auto size-4 animate-spin text-white/40 motion-reduce:animate-none" />
                      ) : (
                        <ArrowRight
                          className="ml-auto h-4 w-4 text-white/25"
                          aria-hidden="true"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-2xl bg-white/[0.02] px-5 py-12 text-center">
          {hasFilters ? (
            <Search className="mb-3 size-6 text-white/30" />
          ) : (
            <Users className="mb-3 size-6 text-white/30" />
          )}
          <p className="text-[15px] font-medium text-white">
            {hasFilters
              ? "No hay coincidencias"
              : team.length === 0
                ? "Tu equipo empieza acá"
                : assignmentFilter === "available"
                  ? "Todo el equipo está en el evento"
                  : "Todavía no hay personas asignadas"}
          </p>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/45">
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

      {inviteDialog}
    </div>
  )
}

function StaffDetail({
  member,
  invitation,
  bars,
  showBars,
  canManage,
  canEditRoles,
  canDelete,
  isGeneralPromoter,
  isPending,
  shopUrl,
  backLabel,
  onBack,
  onToggleAssignment,
  onBarChange,
  onCopyLink,
  onShowAccess,
  onSaveRoles,
  onDelete
}: {
  member: EventAssignmentStaffRow
  invitation?: Invitation
  bars: EventBarRow[]
  showBars: boolean
  canManage: boolean
  canEditRoles: boolean
  canDelete: boolean
  isGeneralPromoter: boolean
  isPending: boolean
  shopUrl: string | null
  backLabel: string
  onBack: () => void
  onToggleAssignment: () => void
  onBarChange: (barId: string | null) => void
  onCopyLink: (url: string, successMessage?: string) => Promise<void>
  onShowAccess: () => void
  onSaveRoles: (roles: StaffRole[]) => Promise<void>
  onDelete: () => Promise<boolean>
}) {
  const roles = memberRoles(member)
  const [selectedRoles, setSelectedRoles] = useState<StaffRole[]>(roles)
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const rolesChanged =
    selectedRoles.length !== roles.length ||
    selectedRoles.some((role) => !roles.includes(role))

  async function saveRoles() {
    if (savingRoles || selectedRoles.length === 0) return
    setSavingRoles(true)
    setRolesError(null)
    try {
      await onSaveRoles(selectedRoles)
    } catch (error) {
      setRolesError(
        error instanceof Error ? error.message : "No se pudieron guardar los roles."
      )
    } finally {
      setSavingRoles(false)
    }
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    const ok = await onDelete()
    if (ok) setDeleteOpen(false)
    setDeleting(false)
  }

  return (
    <section className="w-full" aria-labelledby="staff-detail-title">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="staff-detail-title"
              className="break-words text-2xl font-bold tracking-tight text-white"
            >
              {member.name}
            </h2>
            <p className="mt-1.5 text-[13px] text-white/45">
              {roles.map(staffRoleLabel).join(" · ")}
              {member.generalPromoterName
                ? ` · vía ${member.generalPromoterName}`
                : ""}
            </p>
            <p className="mt-0.5 break-all text-[13px] text-white/35">
              {member.email}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              member.isAssigned
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-white/[0.06] text-white/50"
            }`}
          >
            {member.isAssigned ? <Check className="h-3 w-3" /> : null}
            {member.isAssigned ? "En el evento" : "Disponible"}
          </span>
        </div>
      </header>

      <div className="mt-7 max-w-3xl">
        <DetailBlock
          title="Asignación"
          description={
            isGeneralPromoter
              ? "Definí si este promotor trabaja en el evento."
              : "La persona queda disponible para todas las barras del evento."
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={isPending || !canManage}
              onClick={onToggleAssignment}
              className={
                member.isAssigned
                  ? "h-9 rounded-xl px-3 text-white/60 hover:bg-white/[0.06] hover:text-white"
                  : "h-9 rounded-xl bg-[#FF9500] px-3 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
              }
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : member.isAssigned ? (
                <UserMinus className="mr-1.5 h-4 w-4" />
              ) : (
                <UserPlus className="mr-1.5 h-4 w-4" />
              )}
              {member.isAssigned ? "Quitar del evento" : "Asignar al evento"}
            </Button>
          </div>
          {showBars &&
          member.isAssigned &&
          roles.includes("BARTENDER") ? (
            <div className="mt-4 max-w-xs space-y-2">
              <label
                htmlFor="staff-bar"
                className="block text-[12px] text-white/45"
              >
                Barra asignada
              </label>
              <Select
                value={member.barId ?? "unassigned"}
                onValueChange={(value) =>
                  onBarChange(value === "unassigned" ? null : value)
                }
                disabled={isPending || !canManage}
              >
                <SelectTrigger
                  id="staff-bar"
                  className="h-9 w-full rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none"
                >
                  <SelectValue placeholder="Sin barra asignada" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="unassigned">Sin barra asignada</SelectItem>
                  {bars.map((bar) => (
                    <SelectItem key={bar.id} value={bar.id}>
                      {bar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </DetailBlock>

        {(shopUrl && member.isAssigned) || (canManage && invitation) ? (
          <DetailBlock
            title="Acceso"
            description="Links para compartir con esta persona."
          >
            <div className="space-y-5">
              {shopUrl && member.isAssigned ? (
                <LinkField
                  label="Link de venta"
                  url={shopUrl}
                  href={shopUrl}
                  onCopy={() => void onCopyLink(shopUrl, "Link de venta copiado")}
                />
              ) : null}
              {canManage && invitation ? (
                <div className="space-y-2">
                  <LinkField
                    label="Acceso a Crow"
                    url={invitation.url}
                    onCopy={() =>
                      void onCopyLink(invitation.url, "Link de acceso copiado")
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onShowAccess}
                    className="text-white/55 hover:bg-white/[0.06] hover:text-white"
                  >
                    <QrCode className="mr-1.5 h-4 w-4" />
                    Ver QR
                  </Button>
                </div>
              ) : null}
              {canManage && !invitation ? (
                <p className="text-[13px] leading-relaxed text-white/45">
                  Esta persona todavía no tiene una invitación activa. Podés
                  compartirle un acceso desde «Invitar persona».
                </p>
              ) : null}
            </div>
          </DetailBlock>
        ) : null}

        <DetailBlock
          title="Funciones"
          description="Definen qué puede hacer esta persona dentro de la productora."
        >
          {canEditRoles ? (
            <div className="space-y-4">
              <RoleCheckboxes
                roles={selectedRoles}
                onChange={setSelectedRoles}
                disabled={savingRoles}
              />
              {rolesError ? (
                <p role="alert" className="text-[13px] text-rose-300">
                  {rolesError}
                </p>
              ) : null}
              <Button
                type="button"
                disabled={
                  savingRoles || selectedRoles.length === 0 || !rolesChanged
                }
                onClick={() => void saveRoles()}
                className="h-9 rounded-xl bg-[#FF9500] px-3 font-semibold text-[#18120a] hover:bg-[#FFAB36] disabled:opacity-40"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {savingRoles ? "Guardando…" : "Guardar roles"}
              </Button>
            </div>
          ) : (
            <p className="text-[14px] text-white/70">
              {roles.map(staffRoleLabel).join(" · ")}
            </p>
          )}
        </DetailBlock>

        {canDelete ? (
          <DetailBlock
            title="Eliminar de la productora"
            description="Desaparece del equipo de todos los eventos y pierde el acceso. Sus ventas y registros históricos se conservan."
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="h-9 rounded-lg px-2.5 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar de la productora
            </Button>
          </DetailBlock>
        ) : null}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar a {member.name} de la productora?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta persona desaparecerá del equipo de todos los eventos y perderá
              el acceso a la productora. Sus ventas y registros históricos se
              conservan. Para quitarla solo de este evento, usá «Quitar del
              evento».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {deleting ? "Eliminando…" : "Eliminar de la productora"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function LinkField({
  label,
  url,
  href,
  onCopy
}: {
  label: string
  url: string
  href?: string
  onCopy: () => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-white/45">{label}</p>
      <div className="flex gap-2">
        <Input
          aria-label={label}
          readOnly
          value={url}
          className="h-9 min-w-0 rounded-xl border-0 bg-white/[0.06] text-[12px] text-white/60 shadow-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={onCopy}
          className="h-9 w-9 shrink-0 rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white"
        >
          <Copy className="h-4 w-4" />
        </Button>
        {href ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir ${label.toLowerCase()}`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function DetailBlock({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t border-white/[0.07] pt-7 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-8">
      <div>
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-black p-0 text-white sm:max-w-lg">
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
            <div className="rounded-xl bg-emerald-400/[0.07] p-4">
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
                      className="h-10 min-w-0 border-0 bg-white/[0.06] text-xs text-white/65"
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
                  className="border-0 bg-white/[0.06]"
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
                className="h-10 w-full bg-[#FF9500] text-[#18120a] hover:bg-[#FFAB36]"
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
