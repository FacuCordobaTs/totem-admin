import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventAssignmentStaffRow,
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
}

export function EventStaffTab({ eventId }: Props) {
  const token = useAuthStore((s) => s.token)
  const [rows, setRows] = useState<EventAssignmentStaffRow[]>([])
  const [bars, setBars] = useState<{ id: string; name: string }[]>([])
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
    void postAssign({ staffId: member.id, isAssigned: checked }, prevRows)
  }

  function onBarChange(member: EventAssignmentStaffRow, barId: string | null) {
    if (pendingIds.has(member.id)) return
    const prevRows = rows
    addPending(member.id)
    setRows((r) => r.map((s) => (s.id === member.id ? { ...s, barId } : s)))
    void postAssign({ staffId: member.id, isAssigned: true, barId }, prevRows)
  }

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
                <TableHead className="w-[140px] text-center text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  ¿Trabaja hoy?
                </TableHead>
                <TableHead className="w-[180px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Barra asignada
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => {
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
                    <TableCell className="py-3">
                      {member.isAssigned && bars.length > 0 ? (
                        <Select
                          value={member.barId ?? "none"}
                          onValueChange={(v) =>
                            onBarChange(member, v === "none" ? null : v)
                          }
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-[160px] rounded-xl border-zinc-200/50 bg-white text-[13px] dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                            <SelectValue placeholder="Sin barra" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin barra</SelectItem>
                            {bars.map((bar) => (
                              <SelectItem key={bar.id} value={bar.id}>
                                {bar.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">—</span>
                      )}
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
