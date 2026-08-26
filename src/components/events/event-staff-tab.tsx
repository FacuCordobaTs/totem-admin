import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Plus, QrCode, UserPlus, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventAssignmentStaffRow,
  EventBarsResponse,
  EventBarRow,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { StaffInlineCreate } from "@/components/staff/staff-inline-create"
import { PromotersPanel } from "@/components/events/promoters-panel"
import { cn } from "@/lib/utils"

type StaffRole = EventAssignmentStaffRow["role"]

type Invitation = {
  id: string
  role: StaffRole
  token: string
  url: string
  status: string
  expiresAt: string | null
  createdAt: string | null
}

const INVITE_ROLES: StaffRole[] = ["BARTENDER", "SECURITY", "MANAGER"]

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-white/[0.06]" />
    </div>
  )
}

type Props = {
  eventId: string
  /** Estado derivado del evento; el toggle "trabaja hoy" solo aplica cuando está por venir. */
  eventStatus?: "draft" | "active" | "finished"
}

export function EventStaffTab({ eventId, eventStatus }: Props) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const canInvite = role === "ADMIN"

  const [rows, setRows] = useState<EventAssignmentStaffRow[]>([])
  const [bars, setBars] = useState<EventBarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [staffRes, barsRes] = await Promise.all([
        apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, {
          method: "GET",
          token,
        }),
        apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
          method: "GET",
          token,
        }),
      ])
      setRows(staffRes.staff)
      setBars(barsRes.bars)
    } catch (e) {
      setRows([])
      setError(
        e instanceof ApiError ? e.message : "No se pudo cargar el equipo del evento"
      )
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load])

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

  async function postAssign(
    body: { staffId: string; isAssigned: boolean; barId?: string | null },
    prevRows: EventAssignmentStaffRow[]
  ) {
    if (!token) return
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
    } catch (e) {
      setRows(prevRows)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar la asignación"
      )
    } finally {
      removePending(body.staffId)
    }
  }

  // Un solo gesto: prender/apagar "trabaja esta noche" cuando no hay puestos.
  function toggleWorks(member: EventAssignmentStaffRow, checked: boolean) {
    if (pendingIds.has(member.id)) return
    const prevRows = rows
    addPending(member.id)
    setRows((r) =>
      r.map((s) =>
        s.id === member.id
          ? { ...s, isAssigned: checked, barId: checked ? s.barId : null }
          : s
      )
    )
    void postAssign({ staffId: member.id, isAssigned: checked }, prevRows)
  }

  // Un solo gesto: elegir puesto (asigna + trabaja) o "No" (lo saca).
  function assignToBar(member: EventAssignmentStaffRow, barId: string | null) {
    if (pendingIds.has(member.id)) return
    const prevRows = rows
    addPending(member.id)
    if (barId === null) {
      setRows((r) =>
        r.map((s) =>
          s.id === member.id ? { ...s, isAssigned: false, barId: null } : s
        )
      )
      void postAssign({ staffId: member.id, isAssigned: false }, prevRows)
      return
    }
    setRows((r) =>
      r.map((s) =>
        s.id === member.id ? { ...s, isAssigned: true, barId } : s
      )
    )
    void postAssign({ staffId: member.id, isAssigned: true, barId }, prevRows)
  }

  if (loading) return <SectionSkeleton />

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200/60 bg-red-50 px-5 py-4 text-[15px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    )
  }

  const puestos = bars.filter((b) => !b.isDefault)
  const hasPuestos = puestos.length > 0
  const defaultBar = bars.find((b) => b.isDefault) ?? null
  // Chips de puesto: la barra default se muestra como "General".
  const barChips = bars.map((b) => ({
    id: b.id,
    label: b.isDefault ? "General" : b.name,
  }))
  // El toggle "trabaja hoy" solo tiene sentido antes/durante el evento.
  const showWorkToggle = eventStatus !== "finished"

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[17px] font-medium text-foreground">Esta noche</h3>
          <p className="text-[13px] text-white/40">
            {hasPuestos
              ? "Quién trabaja y en qué puesto."
              : "Quién trabaja esta noche."}
          </p>
        </div>
        {canInvite ? <InvitePanel onInvited={load} /> : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center text-[15px] text-white/45">
          Todavía no hay nadie en el equipo.
          {canInvite ? " Invitá a alguien con el botón de arriba." : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((member) => {
            const busy = pendingIds.has(member.id)
            const selectedBar = member.isAssigned
              ? member.barId ?? defaultBar?.id ?? null
              : null
            return (
              <div
                key={member.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors",
                  member.isAssigned && "border-white/[0.12] bg-white/[0.04]"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground">
                    {member.name}
                  </p>
                  <span className="text-[12px] text-white/40">
                    {staffRoleLabel(member.role)}
                  </span>
                </div>

                {!canManage ? (
                  <span className="text-[13px] text-white/45">
                    {member.isAssigned
                      ? selectedBar && hasPuestos
                        ? barChips.find((c) => c.id === selectedBar)?.label ??
                          "Trabaja"
                        : "Trabaja"
                      : "—"}
                  </span>
                ) : hasPuestos ? (
                  <div className="flex flex-wrap gap-1.5">
                    <ChipButton
                      active={!member.isAssigned}
                      disabled={busy}
                      onClick={() => assignToBar(member, null)}
                      muted
                    >
                      No trabaja
                    </ChipButton>
                    {barChips.map((chip) => (
                      <ChipButton
                        key={chip.id}
                        active={selectedBar === chip.id}
                        disabled={busy}
                        onClick={() => assignToBar(member, chip.id)}
                      >
                        {chip.label}
                      </ChipButton>
                    ))}
                  </div>
                ) : showWorkToggle ? (
                  <ChipButton
                    active={member.isAssigned}
                    disabled={busy}
                    onClick={() => toggleWorks(member, !member.isAssigned)}
                  >
                    {member.isAssigned ? "Trabaja" : "Sumar"}
                  </ChipButton>
                ) : (
                  <span className="text-[13px] text-white/45">
                    {member.isAssigned ? "Trabajó" : "—"}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canInvite ? <StaffInlineCreate onCreated={load} /> : null}

      {/* Tarea 9.1 — Promotores: ABM a nivel productora, atribución en ventas (9.1 + 9.2). */}
      <div className="border-t border-white/[0.06] pt-5">
        <PromotersPanel />
      </div>

      <p className="pt-1 text-[13px] text-white/40">
        El equipo se hereda de la Productora. Los empleados que agregues acá quedan disponibles
        en todos tus eventos.
      </p>
    </div>
  )
}

function ChipButton({
  active,
  muted,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  muted?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-40",
        active
          ? muted
            ? "border-white/20 bg-white/[0.08] text-white/60"
            : "border-[#FF9500] bg-[#FF9500] text-white"
          : "border-white/[0.1] bg-transparent text-white/55 hover:border-white/25 hover:text-white"
      )}
    >
      {children}
    </button>
  )
}

// -----------------------------------------------------------------------------
// Invitar desde acá: genera un link nominado a un rol. Al aceptarlo, la persona
// entra al equipo GLOBAL (spec §4.4). El link vive en /unirse/:token.
// -----------------------------------------------------------------------------
function InvitePanel({ onInvited }: { onInvited: () => void }) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [invites, setInvites] = useState<Invitation[]>([])
  const [role, setRole] = useState<StaffRole>("BARTENDER")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiFetch<{ invitations: Invitation[] }>(
        "/staff/invitations",
        { method: "GET", token }
      )
      setInvites(data.invitations)
    } catch {
      // silencioso: el panel no bloquea la sección
    }
  }, [token])

  useEffect(() => {
    if (open) void loadInvites()
  }, [open, loadInvites])

  async function create() {
    if (!token || creating) return
    setError(null)
    setCreating(true)
    try {
      await apiFetch<{ invitation: Invitation }>("/staff/invitations", {
        method: "POST",
        token,
        body: JSON.stringify({ role }),
      })
      await loadInvites()
      onInvited()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el link")
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!token) return
    const prev = invites
    setInvites((list) => list.filter((i) => i.id !== id))
    try {
      await apiFetch(`/staff/invitations/${id}/revoke`, {
        method: "POST",
        token,
      })
    } catch {
      setInvites(prev)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 text-[13px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Invitar
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-20 w-80 rounded-2xl border border-white/[0.1] bg-zinc-950 p-4 shadow-xl">
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="h-10 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[15px] text-white outline-none focus:border-white/25"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {staffRoleLabel(r)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#FF9500] px-3 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Link
            </button>
          </div>
          {error ? <p className="mt-2 text-[12px] text-red-400">{error}</p> : null}

          <div className="mt-3 space-y-1.5">
            {invites.length === 0 ? (
              <p className="py-1 text-[13px] text-white/35">
                Creá un link y compartilo. Quien lo abra pone su nombre y un PIN, y
                ya entra al equipo.
              </p>
            ) : (
              invites.map((inv) => (
                <InviteRow key={inv.id} invite={inv} onRevoke={revoke} />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function InviteRow({
  invite,
  onRevoke,
}: {
  invite: Invitation
  onRevoke: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(invite.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] text-white/70">
          {staffRoleLabel(invite.role)}
        </span>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors",
            showQr
              ? "border-white/25 text-white"
              : "border-white/[0.1] text-white/60 hover:border-white/25 hover:text-white"
          )}
          aria-pressed={showQr}
        >
          <QrCode className="h-3.5 w-3.5" />
          QR
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.1] px-2 text-[12px] text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copiado" : "Copiar link"}
        </button>
        <button
          type="button"
          onClick={() => onRevoke(invite.id)}
          className="rounded-md p-1 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-red-400"
          aria-label="Anular invitación"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showQr ? (
        <div className="mt-2.5 flex flex-col items-center gap-2 border-t border-white/[0.06] pt-3">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={invite.url} size={160} level="M" />
          </div>
          <p className="text-center text-[12px] text-white/35">
            Escaneá para unirte al equipo.
          </p>
        </div>
      ) : null}
    </div>
  )
}
