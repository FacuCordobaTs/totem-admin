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
import { Calendar, ChevronRight, Plus } from "lucide-react"
import type { ApiEvent } from "@/types/events"

type EventsListResponse = { events: ApiEvent[] }

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
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
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Creá fechas, configurá tipos de entrada y vendé desde boletería.
                  </p>
                </div>
                <Button
                  className="gap-2"
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
                <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="rounded-xl border border-border bg-card ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead className="hidden md:table-cell">Fecha</TableHead>
                      <TableHead className="hidden lg:table-cell">Lugar</TableHead>
                      <TableHead className="w-[120px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          Todavía no hay eventos. Creá el primero para tu productora.
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((ev) => (
                        <TableRow key={ev.id} className="group">
                          <TableCell className="font-medium">
                            <Link
                              to={`/events/${ev.id}`}
                              className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                            >
                              {ev.name}
                              <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {formatEventDate(ev.date)}
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {ev.location ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/events/${ev.id}`}>Abrir</Link>
                            </Button>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo evento</DialogTitle>
            <DialogDescription>
              La fecha y hora se guardan en zona local y se envían al servidor en ISO-8601.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="flex flex-col gap-4">
            {createError ? (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="ev-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="ev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-secondary/50"
                placeholder="Ej. Festival Noches Neón"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ev-date" className="text-sm font-medium">
                Fecha y hora de inicio
              </label>
              <Input
                id="ev-date"
                type="datetime-local"
                value={dateLocal}
                onChange={(e) => setDateLocal(e.target.value)}
                required
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ev-loc" className="text-sm font-medium">
                Lugar (opcional)
              </label>
              <Input
                id="ev-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-secondary/50"
                placeholder="Dirección o venue"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
