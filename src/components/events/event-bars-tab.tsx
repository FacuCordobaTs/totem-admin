import { useCallback, useEffect, useState } from "react"
import { Package, Plus, Settings, Users, Wine } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventBarRow, EventBarsResponse } from "@/types/event-dashboard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BarConfigSheet } from "@/components/events/bar-config-sheet"

const inputClass =
  "h-11 rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

function GridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-2xl border border-zinc-200/50 bg-zinc-200/40 dark:border-zinc-800/50 dark:bg-zinc-800/40"
        />
      ))}
    </div>
  )
}

function formatCurrencyArs(amountStr: string): string {
  const n = Number.parseFloat(amountStr)
  if (Number.isNaN(n)) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0)
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

type Props = {
  eventId: string
  /** Oculta el encabezado de página cuando el tab está embebido en otra vista */
  embedded?: boolean
}

export function EventBarsTab({ eventId, embedded = false }: Props) {
  const token = useAuthStore((s) => s.token)
  const [bars, setBars] = useState<EventBarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createBusy, setCreateBusy] = useState(false)

  const [configBar, setConfigBar] = useState<EventBarRow | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
        method: "GET",
        token,
      })
      setBars(res.bars)
    } catch (e) {
      setBars([])
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar las barras")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setConfigBar((prev) => {
      if (!prev) return null
      const next = bars.find((b) => b.id === prev.id)
      return next ?? prev
    })
  }, [bars])

  async function submitCreate() {
    const name = createName.trim()
    if (!token || !name || createBusy) return
    setCreateBusy(true)
    try {
      await apiFetch(`/events/${eventId}/bars`, {
        method: "POST",
        token,
        body: JSON.stringify({ name }),
      })
      toast.success("Barra creada")
      setCreateOpen(false)
      setCreateName("")
      await load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la barra")
    } finally {
      setCreateBusy(false)
    }
  }

  if (loading) {
    return <GridSkeleton />
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
      {embedded ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
            Puntos de venta y rendimiento
          </p>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Crear barra
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Puntos de venta
            </p>
            <h2 className="mt-1 text-[28px] font-bold tracking-tight text-black dark:text-white md:text-[34px]">
              Barras del evento
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              Barras físicas del evento: personal asignado, productos activos, stock en barra
              y ventas POS atribuidas a cada punto de venta.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-11 gap-2 rounded-xl bg-[#FF9500] px-5 text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Plus className="h-4 w-4 text-white" />
            </span>
            Crear barra
          </Button>
        </div>
      )}

      {bars.length === 0 ? (
        <Card className="rounded-2xl border border-dashed border-zinc-200/50 bg-white dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
          <CardContent className="flex flex-col items-center gap-5 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10">
              <Wine className="h-7 w-7 text-[#8E8E93]" />
            </span>
            <p className="max-w-md text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              No hay barras creadas en este evento. Creá la primera para organizar stock,
              personal y ventas por punto de venta.
            </p>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-11 rounded-xl bg-[#FF9500] px-6 text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
            >
              Crear barra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bars.map((bar) => (
            <Card
              key={bar.id}
              className={
                bar.isActive === false
                  ? "rounded-2xl border border-dashed border-zinc-200/50 bg-background opacity-90 dark:border-zinc-800/50"
                  : "rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50"
              }
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[19px] font-bold tracking-tight text-black dark:text-white">
                      {bar.name}
                    </h3>
                    {bar.isActive === false ? (
                      <span className="rounded-md bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93]">
                        Inactiva
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl text-[#8E8E93] hover:bg-zinc-500/10 dark:text-[#98989D]"
                  aria-label={`Configurar ${bar.name}`}
                  onClick={() => {
                    setConfigBar(bar)
                    setConfigOpen(true)
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5 pt-0">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Ventas
                  </p>
                  <p className="mt-1 truncate text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {formatCurrencyArs(bar.totalSales ?? "0")}
                  </p>
                </div>
                <div className="space-y-3 border-t border-zinc-200/40 pt-3 dark:border-zinc-800/40">
                  <div className="flex gap-2.5">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8E8E93] dark:text-[#98989D]" />
                    <div className="min-w-0 flex-1">
                      {(bar.staffList?.length ?? 0) > 0 ? (
                        <ul className="flex list-none flex-col gap-0.5 text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          {bar.staffList.map((name, i) => (
                            <li key={`${name}-${i}`} className="truncate">
                              {name}
                              {i < bar.staffList.length - 1 ? "," : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          Sin personal asignado
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8E8E93] dark:text-[#98989D]" />
                    <div className="min-w-0 flex-1">
                      {(bar.productList?.length ?? 0) > 0 ? (
                        <ul className="flex list-none flex-col gap-0.5 text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          {bar.productList.map((name, i) => (
                            <li key={`${name}-${i}`} className="truncate">
                              {name}
                              {i < bar.productList.length - 1 ? "," : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          Menú vacío
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Wine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8E8E93] dark:text-[#98989D]" />
                    <div className="min-w-0 flex-1">
                      {(bar.inventoryList?.length ?? 0) > 0 ? (
                        <ul className="flex list-none flex-col gap-0.5 text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          {bar.inventoryList.map((inv, i) => (
                            <li
                              key={`${inv.name}-${i}`}
                              className="truncate"
                            >
                              {inv.bottles} botellas de {inv.name}
                              {i < bar.inventoryList.length - 1 ? "," : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                          Sin stock en barra
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-md dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
          <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                <Wine className="h-6 w-6 text-[#FF9500]" />
              </span>
              <DialogHeader className="flex-1 text-left">
                <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                  Nueva barra
                </DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-3 p-6">
            <label
              className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
              htmlFor="bar-name-create"
            >
              Nombre
            </label>
            <Input
              id="bar-name-create"
              placeholder="Ej. Barra VIP"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className={inputClass}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCreate()
              }}
            />
          </div>
          <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
            <DialogFooter className="flex-col gap-3 sm:flex-col">
              <Button
                type="button"
                disabled={!createName.trim() || createBusy}
                onClick={() => void submitCreate()}
                className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
              >
                {createBusy ? "Creando…" : "Crear"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="h-11 w-full rounded-xl border-zinc-200/50 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
              >
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <BarConfigSheet
        open={configOpen}
        onOpenChange={(open) => {
          setConfigOpen(open)
          if (!open) setConfigBar(null)
        }}
        eventId={eventId}
        bar={configBar}
        onBarUpdated={() => void load({ silent: true })}
      />
    </div>
  )
}
