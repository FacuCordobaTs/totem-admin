import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { ChevronRight, Plus } from "lucide-react"
import type { ApiEvent } from "@/types/events"

type EventsListResponse = { events: ApiEvent[] }

function formatEventDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function EventsListPage() {
  const token = useAuthStore((s) => s.token)
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const role = useAuthStore((s) => s.staff?.role)
  const isAdmin = role === "ADMIN"

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [dateLocal, setDateLocal] = useState("")
  const [location, setLocation] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const hasTenant = tenantId != null && tenantId !== ""

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<EventsListResponse>("/events", { method: "GET", token })
      setEvents(data.events)
    } catch (err) {
      setEvents([])
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los eventos")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    if (!hasTenant) {
      setLoading(false)
      setEvents([])
      return
    }
    void load()
  }, [token, hasTenant, load])

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setCreateError(null)
    const iso = new Date(dateLocal)
    if (Number.isNaN(iso.getTime())) {
      setCreateError("Fecha u hora inválida")
      return
    }
    setCreateLoading(true)
    try {
      await apiFetch<{ event: ApiEvent }>("/events", {
        method: "POST",
        token,
        body: JSON.stringify({
          name,
          date: iso.toISOString(),
          location: location.trim() || undefined,
        }),
      })
      setCreateOpen(false)
      setName("")
      setDateLocal("")
      setLocation("")
      await load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear el evento")
    } finally {
      setCreateLoading(false)
    }
  }

  const needsProductora = !hasTenant

  return (
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          {needsProductora ? (
            <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center py-8">
              {isAdmin ? (
                <ProductoraSetupCard />
              ) : (
                <ProductoraWaitingCard />
              )}
            </div>
          ) : (
            <>
              <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Eventos
                </h1>
                <Button
                  className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
                  onClick={() => {
                    setCreateError(null)
                    setCreateOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Crear evento
                </Button>
              </div>

              {error ? (
                <p className="mb-6 text-[15px] text-red-600 dark:text-red-400">{error}</p>
              ) : null}

              <div className="overflow-hidden rounded-2xl bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                      <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                        Evento
                      </TableHead>
                      <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] sm:table-cell dark:text-[#98989D]">
                        Fecha
                      </TableHead>
                      <TableHead className="w-10 pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={3} className="py-10 text-[#8E8E93] dark:text-[#98989D]">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={3} className="py-10 text-[#8E8E93] dark:text-[#98989D]">
                          Sin eventos todavía.
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((ev) => (
                        <TableRow
                          key={ev.id}
                          className="cursor-pointer border-0 transition-colors hover:bg-[#F2F2F7]/80 dark:hover:bg-zinc-800/30"
                        >
                          <TableCell className="pl-6 py-3.5">
                            <Link
                              to={`/events/${ev.id}`}
                              className="block font-semibold text-foreground"
                            >
                              {ev.name}
                            </Link>
                            <p className="mt-0.5 text-sm text-[#8E8E93] sm:hidden dark:text-[#98989D]">
                              {formatEventDateShort(ev.date)}
                              {ev.location ? ` · ${ev.location}` : ""}
                            </p>
                          </TableCell>
                          <TableCell className="hidden py-3.5 text-[15px] text-[#8E8E93] sm:table-cell dark:text-[#98989D]">
                            {formatEventDateShort(ev.date)}
                          </TableCell>
                          <TableCell className="pr-4 py-3.5 text-right">
                            <Link to={`/events/${ev.id}`} aria-label={`Abrir ${ev.name}`}>
                              <ChevronRight className="inline h-4 w-4 text-[#C7C7CC] dark:text-[#48484A]" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl border-zinc-200/50 dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Nuevo evento
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8E8E93] dark:text-[#98989D]">
              Nombre y fecha de inicio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="flex flex-col gap-4">
            {createError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="ev-name" className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                Nombre
              </label>
              <Input
                id="ev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                placeholder="Ej. Festival Noches Neón"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ev-date" className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                Fecha y hora
              </label>
              <Input
                id="ev-date"
                type="datetime-local"
                value={dateLocal}
                onChange={(e) => setDateLocal(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ev-loc" className="text-[13px] font-medium text-[#8E8E93] dark:text-[#98989D]">
                Lugar (opcional)
              </label>
              <Input
                id="ev-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                placeholder="Venue o dirección"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
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
    </div>
  )
}
