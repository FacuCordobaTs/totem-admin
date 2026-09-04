import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Loader2, Plus, UserPlus, Users } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventAssignmentStaffRow, EventBarRow, EventBarsResponse, EventStaffListResponse } from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { PromotersPanel } from "@/components/events/promoters-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type StaffRole = EventAssignmentStaffRow["role"]

type Invitation = {
  id: string
  name: string
  role: StaffRole
  url: string
  acceptedStaffId: string | null
}

type InvitationsResponse = { invitations: Invitation[] }

const INVITE_ROLES: StaffRole[] = ["BARTENDER", "SECURITY", "MANAGER"]
const ROLE_ORDER: StaffRole[] = ["MANAGER", "BARTENDER", "SECURITY", "ADMIN"]

type Props = {
  eventId: string
  inviteAccessHint?: string
  /** En eventos de solo entradas, Equipo se reduce a la gestión de promotores. */
  promotersOnly?: boolean
}

export function EventStaffTab({ eventId, inviteAccessHint, promotersOnly = false }: Props) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const canInvite = role === "ADMIN"
  const [rows, setRows] = useState<EventAssignmentStaffRow[]>([])
  const [bars, setBars] = useState<EventBarRow[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamOpen, setTeamOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitationToShow, setInvitationToShow] = useState<Invitation | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async (showLoading = false) => {
    if (!token) return
    if (promotersOnly) {
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const [staffData, invitationsData, barsData] = await Promise.all([
        apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, { method: "GET", token }),
        canInvite
          ? apiFetch<InvitationsResponse>("/staff/invitations", { method: "GET", token })
          : Promise.resolve(null),
        apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, { method: "GET", token }),
      ])
      setRows(staffData.staff)
      setInvitations(invitationsData?.invitations ?? [])
      setBars(barsData.bars.filter((bar) => bar.isActive !== false))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el equipo del evento")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [canInvite, eventId, promotersOnly, token])

  useEffect(() => { void load(true) }, [load])

  const groupedAssigned = useMemo(() => {
    const assigned = rows.filter((member) => member.isAssigned)
    return ROLE_ORDER.map((staffRole) => ({
      role: staffRole,
      members: assigned.filter((member) => member.role === staffRole),
    })).filter((group) => group.members.length > 0)
  }, [rows])

  const invitationsByStaffId = useMemo(
    () => new Map(
      invitations
        .filter((invitation) => invitation.acceptedStaffId != null)
        .map((invitation) => [invitation.acceptedStaffId!, invitation])
    ),
    [invitations]
  )

  async function setAssignment(member: EventAssignmentStaffRow, isAssigned: boolean, barId?: string | null) {
    if (!token || pendingIds.has(member.id)) return
    const previous = rows
    setPendingIds((ids) => new Set(ids).add(member.id))
    setRows((current) => current.map((row) => row.id === member.id ? { ...row, isAssigned, barId: isAssigned ? (barId === undefined ? row.barId : barId) : null } : row))
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({ staffId: member.id, isAssigned, ...(isAssigned && barId !== undefined ? { barId } : {}) }),
      })
    } catch (e) {
      setRows(previous)
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el equipo")
    } finally {
      setPendingIds((ids) => {
        const next = new Set(ids)
        next.delete(member.id)
        return next
      })
    }
  }

  if (promotersOnly) {
    return <PromotersPanel />
  }

  if (loading) return <div className="h-36 animate-pulse rounded-2xl bg-white/[0.06]" />
  if (error) return <div className="rounded-2xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-[15px] text-red-300">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[17px] font-medium text-foreground">Equipo asignado</p>
          <p className="mt-1 text-[13px] text-white/40">Las personas que trabajan en este evento.</p>
        </div>
        {canManage ? <Button type="button" onClick={() => setTeamOpen(true)} className="gap-2 rounded-lg bg-[#FF9500] text-white hover:bg-[#FF9500]/90"><Users className="h-4 w-4" />Gestionar equipo</Button> : null}
      </div>

      {groupedAssigned.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center text-[15px] text-white/45">
          No hay empleados asignados a este evento.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedAssigned.map((group) => (
            <section key={group.role}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">{staffRoleLabel(group.role)} · {group.members.length}</p>
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                {group.members.map((member, index) => <div key={member.id} className={`px-4 py-3 text-[14px] text-white/80 ${index > 0 ? "border-t border-white/[0.06]" : ""}`}>{member.name}</div>)}
              </div>
            </section>
          ))}
        </div>
      )}

      <TeamDialog
        open={teamOpen}
        onOpenChange={setTeamOpen}
        rows={rows}
        pendingIds={pendingIds}
        canInvite={canInvite}
        bars={bars}
        invitationsByStaffId={invitationsByStaffId}
        onToggle={setAssignment}
        onAssignBar={(member, barId) => void setAssignment(member, true, barId)}
        onInvite={() => {
          setInvitationToShow(null)
          setInviteOpen(true)
        }}
        onReinvite={(invitation) => {
          setInvitationToShow(invitation)
          setInviteOpen(true)
        }}
      />
      {canInvite ? <InviteEmployeeDialog eventId={eventId} open={inviteOpen} onOpenChange={setInviteOpen} onCreated={load} accessHint={inviteAccessHint} initialInvitation={invitationToShow} /> : null}
      <div className="border-t border-white/[0.06] pt-6"><PromotersPanel /></div>
    </div>
  )
}

function TeamDialog({ open, onOpenChange, rows, pendingIds, canInvite, bars, invitationsByStaffId, onToggle, onAssignBar, onInvite, onReinvite }: {
  open: boolean; onOpenChange: (open: boolean) => void; rows: EventAssignmentStaffRow[]; pendingIds: Set<string>; canInvite: boolean
  bars: EventBarRow[]
  invitationsByStaffId: Map<string, Invitation>
  onToggle: (member: EventAssignmentStaffRow, isAssigned: boolean) => void; onAssignBar: (member: EventAssignmentStaffRow, barId: string | null) => void; onInvite: () => void; onReinvite: (invitation: Invitation) => void
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-white/[0.1] bg-black p-0 text-white">
      <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left">
        <div className="flex items-start justify-between gap-8 pr-8"><div><DialogTitle className="text-xl">Equipo de la productora</DialogTitle><DialogDescription className="mt-1 text-white/45">Sumá al evento a las personas disponibles en tu equipo.</DialogDescription></div>{canInvite ? <Button type="button" size="sm" onClick={onInvite} className="shrink-0 gap-1.5 bg-[#FF9500] text-white hover:bg-[#FF9500]/90"><UserPlus className="h-4 w-4" />Invitar empleado</Button> : null}</div>
      </DialogHeader>
      <div className="overflow-y-auto p-4">
        {rows.length === 0 ? <p className="py-10 text-center text-sm text-white/40">Todavía no hay empleados en la productora.</p> : <div className="space-y-1.5">{rows.map((member) => {
          const assigned = member.isAssigned
          const busy = pendingIds.has(member.id)
          const invitation = invitationsByStaffId.get(member.id)
          return <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-medium">{member.name}</p><p className="text-[12px] text-white/40">{staffRoleLabel(member.role)}</p></div>{member.role === "BARTENDER" ? <Select value={member.barId ?? "unassigned"} onValueChange={(value) => onAssignBar(member, value === "unassigned" ? null : value)} disabled={busy}><SelectTrigger className="h-8 w-40 border-white/[0.14] bg-transparent text-xs text-white/70"><SelectValue placeholder="Sin barra" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sin barra</SelectItem>{bars.map((bar) => <SelectItem key={bar.id} value={bar.id}>{bar.name}</SelectItem>)}</SelectContent></Select> : null}<div className="flex shrink-0 items-center gap-2">{canInvite && invitation ? <Button type="button" size="sm" variant="outline" onClick={() => onReinvite(invitation)} className="border-white/[0.14] bg-transparent text-white/70 hover:bg-white/[0.08]">Reinvitar</Button> : null}<Button type="button" size="sm" variant={assigned ? "outline" : "default"} disabled={busy} onClick={() => onToggle(member, !assigned)} className={assigned ? "border-white/[0.14] bg-transparent text-white/70 hover:bg-white/[0.08]" : "bg-[#FF9500] text-white hover:bg-[#FF9500]/90"}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : assigned ? "Quitar" : <><Plus className="mr-1 h-4 w-4" />Sumar</>}</Button></div></div>
        })}</div>}
      </div>
    </DialogContent>
  </Dialog>
}

function InviteEmployeeDialog({ eventId, open, onOpenChange, onCreated, accessHint, initialInvitation }: { eventId: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void; accessHint?: string; initialInvitation: Invitation | null }) {
  const token = useAuthStore((s) => s.token)
  const [name, setName] = useState("")
  const [role, setRole] = useState<StaffRole>("BARTENDER")
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
    if (!nextOpen) {
      setInvitation(null)
      setError(null)
      setName("")
      setRole("BARTENDER")
    }
    onOpenChange(nextOpen)
  }

  async function create() {
    if (!token || saving) return
    if (!name.trim()) return setError("Completá el nombre del empleado.")
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<{ invitation: Invitation }>("/staff/invitations", { method: "POST", token, body: JSON.stringify({ name: name.trim(), role, eventId }) })
      setInvitation(data.invitation)
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la invitación")
    } finally {
      setSaving(false)
    }
  }

  function copy() {
    if (!invitation) return
    void navigator.clipboard.writeText(invitation.url)
    toast.success("Link copiado")
  }

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-w-lg rounded-2xl border-white/[0.1] bg-black p-0 text-white">
      <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left"><DialogTitle className="text-xl">Invitar empleado</DialogTitle><DialogDescription className="mt-1 text-white/45">La invitación crea el acceso al equipo de tu productora.</DialogDescription></DialogHeader>
      <div className="space-y-4 px-6 py-5">{invitation ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4"><p className="font-medium text-emerald-300">Link de invitación</p><p className="mt-1 text-sm text-white/55">{invitation.name} · {staffRoleLabel(invitation.role)}</p><div className="mt-4 flex flex-col items-center gap-4"><div className="rounded-xl bg-white p-3"><QRCodeSVG value={invitation.url} size={144} level="M" includeMargin /></div><div className="min-w-0 self-stretch"><p className="text-sm text-white/55">{accessHint ?? "Escaneá el QR para abrir la invitación."}</p><div className="mt-3 flex gap-2"><Input readOnly value={invitation.url} className="h-10 min-w-0 border-white/[0.1] bg-black text-xs text-white/65" /><Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copiar link de invitación" className="shrink-0 border-white/[0.12] bg-transparent"><Copy className="h-4 w-4" /></Button></div></div></div></div> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create() }}><Field label="Nombre del empleado"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellido" className="border-white/[0.1] bg-white/[0.04]" /></Field><Field label="Rol"><Select value={role} onValueChange={(value) => setRole(value as StaffRole)}><SelectTrigger className="border-white/[0.1] bg-white/[0.04]"><SelectValue /></SelectTrigger><SelectContent>{INVITE_ROLES.map((item) => <SelectItem key={item} value={item}>{staffRoleLabel(item)}</SelectItem>)}</SelectContent></Select></Field><Button type="submit" disabled={saving} className="w-full bg-[#FF9500] text-white hover:bg-[#FF9500]/90">{saving ? "Creando…" : "Crear invitación"}</Button></form>}{error ? <p className="text-sm text-red-400">{error}</p> : null}</div>
    </DialogContent>
  </Dialog>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium text-white/70">{label}</span>{children}</label>
}
