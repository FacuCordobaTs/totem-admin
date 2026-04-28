import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { useAuthStore } from "@/stores/auth-store"
import {
  ProductoraSetupCard,
  ProductoraWaitingCard,
} from "@/components/onboarding/productora-setup-card"
import { apiFetch, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import type { DashboardKpiData } from "@/components/dashboard/kpi-cards"
import type { ApiEvent } from "@/types/events"
import { ChevronRight } from "lucide-react"

type AnalyticsKpisResponse = {
  kpis: Pick<DashboardKpiData, "totalTicketsSold" | "usedTickets">
}

type EventsListResponse = { events: ApiEvent[] }

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function pickHubEvents(events: ApiEvent[]): ApiEvent[] {
  if (events.length === 0) return []
  const now = Date.now()
  const byDateAsc = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const upcoming = byDateAsc.filter((e) => new Date(e.date).getTime() >= now)
  const picked: ApiEvent[] = []
  for (const e of upcoming) {
    if (picked.length >= 3) break
    picked.push(e)
  }
  if (picked.length < 3) {
    const past = [...byDateAsc]
      .filter((e) => new Date(e.date).getTime() < now)
      .reverse()
    for (const e of past) {
      if (picked.length >= 3) break
      if (!picked.some((p) => p.id === e.id)) picked.push(e)
    }
  }
  return picked.slice(0, 3)
}

export function DashboardPage() {
  const tenantId = useAuthStore((s) => s.staff?.tenantId)
  const tenantName = useAuthStore((s) => s.staff?.tenantName)
  const staffName = useAuthStore((s) => s.staff?.name)
  const role = useAuthStore((s) => s.staff?.role)
  const token = useAuthStore((s) => s.token)
  const isAdmin = role === "ADMIN"
  const hasTenant = tenantId != null && tenantId !== ""

  const [kpis, setKpis] = useState<AnalyticsKpisResponse["kpis"] | null>(null)
  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hubEvents = useMemo(() => pickHubEvents(events), [events])

  const greetingName = tenantName?.trim() || "tu productora"
  const firstName = staffName?.trim().split(/\s+/)[0] ?? "Hola"

  const load = useCallback(async () => {
    if (!token || !hasTenant) {
      setKpis(null)
      setEvents([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [analyticsRes, eventsRes] = await Promise.all([
        apiFetch<AnalyticsKpisResponse>("/analytics/dashboard", {
          method: "GET",
          token,
        }),
        apiFetch<EventsListResponse>("/events", { method: "GET", token }),
      ])
      setKpis(analyticsRes.kpis)
      setEvents(eventsRes.events)
    } catch (err) {
      setKpis(null)
      setEvents([])
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el panel")
    } finally {
      setLoading(false)
    }
  }, [token, hasTenant])

  useEffect(() => {
    void load()
  }, [load])

  if (!hasTenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F7] px-4 py-12 dark:bg-black">
        {isAdmin ? <ProductoraSetupCard /> : <ProductoraWaitingCard />}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-3xl space-y-16">
            {error ? (
              <p className="text-[15px] text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <header className="space-y-2">
              <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                {loading ? "Cargando…" : `Hola, ${firstName}`}
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {greetingName}
              </h1>
            </header>

            <section className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Entradas
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-background p-6">
                  <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                    Vendidas
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {kpis != null ? kpis.totalTicketsSold : loading ? "…" : "0"}
                  </p>
                </div>
                <div className="rounded-2xl bg-background p-6">
                  <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">Usadas</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {kpis != null ? kpis.usedTickets : loading ? "…" : "0"}
                  </p>
                </div>
              </div>
              <p className="text-[12px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                Las entradas canceladas no suman en estas métricas.
              </p>
              <Button variant="ghost" className="h-auto p-0 text-[15px] text-[#8E8E93] hover:text-foreground dark:text-[#98989D]" asChild>
                <Link to="/metrics" className="inline-flex items-center gap-1">
                  Métricas
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </Link>
              </Button>
            </section>

            <section className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Próximos eventos
                </h2>
                <Button
                  asChild
                  className="h-10 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
                >
                  <Link to="/events" className="inline-flex items-center gap-1">
                    Ver todos
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {hubEvents.length === 0 ? (
                <p className="rounded-2xl bg-background px-6 py-12 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                  No hay eventos todavía.
                </p>
              ) : (
                <ul className="space-y-2">
                  {hubEvents.map((ev) => (
                    <li key={ev.id}>
                      <Link
                        to={`/events/${ev.id}`}
                        className="flex items-center gap-4 rounded-2xl bg-background px-5 py-4 transition-colors active:opacity-80"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">
                            {ev.name}
                          </p>
                          <p className="mt-0.5 text-sm text-[#8E8E93] dark:text-[#98989D]">
                            {formatEventDate(ev.date)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#C7C7CC] dark:text-[#48484A]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Accesos
              </h2>
              <div className="divide-y divide-zinc-200/50 overflow-hidden rounded-2xl bg-background dark:divide-zinc-800/50">
                <Link
                  to="/inventory"
                  className="flex items-center justify-between px-5 py-4 transition-colors active:bg-zinc-50 dark:active:bg-zinc-800/40"
                >
                  <span className="text-[17px] font-medium text-foreground">
                    Inventario
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#C7C7CC] dark:text-[#48484A]" />
                </Link>
                <Link
                  to="/staff"
                  className="flex items-center justify-between px-5 py-4 transition-colors active:bg-zinc-50 dark:active:bg-zinc-800/40"
                >
                  <span className="text-[17px] font-medium text-foreground">
                    Personal
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#C7C7CC] dark:text-[#48484A]" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
