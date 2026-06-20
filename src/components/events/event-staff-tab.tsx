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
  eventStatus?: "draft" | "active" | "finished"
}

export function EventStaffTab({ eventId, eventStatus }: Props) {
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
        <Card className="rounded-2xl ">
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
        <div className="overflow-hidden rounded-2xl ">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="pl-6 text-[11px] font-normal lowercase text-white/45">
                  Nombre
                </TableHead>
                <TableHead className="w-[120px] text-[11px] font-normal lowercase text-white/45">
                  Rol
                </TableHead>
                {eventStatus === "active" || eventStatus == null ? (
                <TableHead className="w-[140px] text-center text-[11px] font-normal lowercase text-white/45">
                  ¿trabaja hoy?
                </TableHead>
                ) : null}
                <TableHead className="w-[180px] text-[11px] font-normal lowercase text-white/45">
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
                    className="border-white/[0.06] transition-colors duration-200 hover:bg-white/[0.03]"
                  >
                    <TableCell className="pl-6 py-3.5 font-semibold text-black dark:text-white">
                      {member.name}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="inline-flex rounded-md bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-white/45">
                        {staffRoleLabel(member.role)}
                      </span>
                    </TableCell>
                    {(eventStatus === "active" || eventStatus == null) ? (
                    <TableCell className="py-3.5 text-center">
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={member.isAssigned}
                          disabled={busy}
                          onChange={(e) => onSwitchChange(member, e.target.checked)}
                          aria-label={
                            member.isAssigned
                              ? `Quitar a ${member.name} del evento`
                              : `Asignar a ${member.name} al evento`
                          }
                          className="h-4 w-4 cursor-pointer appearance-none rounded border border-white/20 bg-white/[0.06] checked:border-[#FF9500] checked:bg-[#FF9500] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                          style={{
                            backgroundImage: member.isAssigned
                              ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 10 10' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 5l2.5 2.5L8 3' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
                              : "none",
                            backgroundSize: "100%",
                          }}
                        />
                      </div>
                    </TableCell>
                    ) : null}
                    <TableCell className="py-3">
                      {member.isAssigned && bars.length > 0 ? (
                        <Select
                          value={member.barId ?? "none"}
                          onValueChange={(v) =>
                            onBarChange(member, v === "none" ? null : v)
                          }
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-[160px] rounded-xl border-white/[0.12]  text-[13px]">
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
