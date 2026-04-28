import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventAssignmentStaffRow,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const staffRes = await apiFetch<EventStaffListResponse>(
        `/events/${eventId}/staff`,
        {
          method: "GET",
          token,
        }
      )
      setRows(staffRes.staff)
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
    void postAssign(
      {
        staffId: member.id,
        isAssigned: checked,
      },
      prevRows
    )
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
              Turno en este evento
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Marcá quién trabaja el evento. La asignación a una barra física se hace desde{" "}
              <span className="font-semibold text-black dark:text-white">
                Barras → configuración → Personal
              </span>
              .
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
