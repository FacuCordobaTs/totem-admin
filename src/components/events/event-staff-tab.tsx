import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventAssignmentStaffRow,
  EventBarRow,
  EventBarsResponse,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Users } from "lucide-react"

const UNASSIGNED_BAR_VALUE = "__unassigned__"

const selectClass =
  "h-10 w-full max-w-[300px] rounded-xl border-zinc-200/50 bg-white px-3 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-200/50 dark:bg-zinc-700/50" />
      <div className="h-52 w-full animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-700/50" />
    </div>
  )
}

type Props = {
  eventId: string
  embedded?: boolean
}

export function EventStaffTab({ eventId, embedded = false }: Props) {
  const token = useAuthStore((s) => s.token)
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
      setBars([])
      setError(
        e instanceof ApiError ? e.message : "No se pudo cargar el personal del evento"
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
    body: {
      staffId: string
      isAssigned: boolean
      barId?: string | null
    },
    prevRows: EventAssignmentStaffRow[]
  ) {
    if (!token) return
    const { staffId } = body
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
      removePending(staffId)
    }
  }

  function onSwitchChange(member: EventAssignmentStaffRow, checked: boolean) {
    if (pendingIds.has(member.id)) return
    const prevRows = rows
    addPending(member.id)
    setRows((r) =>
      r.map((s) =>
        s.id === member.id
          ? {
              ...s,
              isAssigned: checked,
              barId: checked ? s.barId : null,
            }
          : s
      )
    )
    const body: {
      staffId: string
      isAssigned: boolean
      barId?: string | null
    } = {
      staffId: member.id,
      isAssigned: checked,
    }
    if (checked && member.barId != null) {
      body.barId = member.barId
    }
    void postAssign(body, prevRows)
  }

  function onBarChange(member: EventAssignmentStaffRow, value: string) {
    if (pendingIds.has(member.id) || !member.isAssigned) return
    const prevRows = rows
    const nextBarId = value === UNASSIGNED_BAR_VALUE ? null : value
    addPending(member.id)
    setRows((r) => r.map((s) => (s.id === member.id ? { ...s, barId: nextBarId } : s)))
    void postAssign(
      {
        staffId: member.id,
        isAssigned: true,
        barId: nextBarId,
      },
      prevRows
    )
  }

  const activeBars = bars.filter((b) => b.isActive !== false)

  if (loading) {
    return <TableSkeleton />
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200/60 bg-red-50 px-5 py-4 text-[15px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {!embedded ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
            <Users className="h-6 w-6 text-[#FF9500]" />
          </span>
          <div>
            <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Equipo
            </p>
            <h2 className="mt-1 text-[28px] font-bold tracking-tight text-black dark:text-white md:text-[34px]">
              Turno y puesto en este evento
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Marcá quién trabaja el evento y, si aplica, asignalo a una barra física. Una
              persona solo puede tener un puesto por evento.
            </p>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card className="rounded-2xl border border-dashed border-zinc-200/50 bg-white dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
          <CardContent className="py-12 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            No hay personal activo en la Productora. Gestioná el equipo en{" "}
            <Button
              asChild
              variant="link"
              className="h-auto p-0 text-[15px] font-semibold text-[#FF9500]"
            >
              <Link to="/staff">Personal</Link>
            </Button>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Nombre
                </TableHead>
                <TableHead className="w-[120px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Rol
                </TableHead>
                <TableHead className="w-[160px] text-center text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  ¿Trabaja hoy?
                </TableHead>
                <TableHead className="min-w-[220px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Barra asignada
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => {
                const selectValue = member.barId ?? UNASSIGNED_BAR_VALUE
                const busy = pendingIds.has(member.id)
                return (
                  <TableRow
                    key={member.id}
                    className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                  >
                    <TableCell className="pl-6 py-3.5 font-semibold text-black dark:text-white">
                      {member.name}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="inline-flex rounded-md bg-zinc-500/10 px-2 py-0.5 text-[11px] font-semibold text-[#8E8E93] dark:text-[#98989D]">
                        {staffRoleLabel(member.role)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={member.isAssigned}
                          disabled={busy}
                          onCheckedChange={(v) => onSwitchChange(member, v)}
                          aria-label={
                            member.isAssigned
                              ? `Quitar a ${member.name} del evento`
                              : `Asignar a ${member.name} al evento`
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Select
                        value={selectValue}
                        disabled={!member.isAssigned || busy}
                        onValueChange={(v) => onBarChange(member, v)}
                      >
                        <SelectTrigger className={selectClass}>
                          <SelectValue placeholder="Elegir barra" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                          <SelectItem value={UNASSIGNED_BAR_VALUE} className="rounded-lg py-2">
                            Sin barra (evento general)
                          </SelectItem>
                          {activeBars.map((b) => (
                            <SelectItem key={b.id} value={b.id} className="rounded-lg py-2">
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {member.isAssigned && activeBars.length === 0 ? (
                        <p className="mt-2 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                          No hay barras en este evento. Creá barras en la pestaña{" "}
                          <span className="font-semibold text-black dark:text-white">
                            Barras
                          </span>
                          .
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
