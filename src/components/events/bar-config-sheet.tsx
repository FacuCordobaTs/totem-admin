import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  BarInventoryApiResponse,
  BarInventoryItemRow,
  BarMenuProductRow,
  BarMenuProductsApiResponse,
  EventAssignmentStaffRow,
  EventBarRow,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import { staffRoleLabel } from "@/lib/role-labels"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Package, SlidersHorizontal, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

const inputClass =
  "h-11 rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function parseBottlesDraft(
  item: BarInventoryItemRow,
  draft: string | undefined
): number {
  const raw = (
    draft ??
    (hasBottlePackage(item)
      ? stockBaseToBottleDraft(item.barCurrentStock, item.packageSize)
      : item.barCurrentStock)
  )
    .trim()
    .replace(",", ".")
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return hasBottlePackage(item) ? Math.round(n) : Math.floor(n)
}

function bottlesInDepot(item: BarInventoryItemRow): number {
  const u = Number.parseFloat(item.unallocatedEventStock)
  if (!Number.isFinite(u) || u < 0) return 0
  if (!hasBottlePackage(item)) return Math.floor(u)
  const per = Number.parseFloat(item.packageSize)
  if (!Number.isFinite(per) || per <= 0) return 0
  return Math.max(0, Math.floor(u / per + 1e-9))
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  bar: EventBarRow | null
  onBarUpdated?: () => void
}

export function BarConfigSheet({
  open,
  onOpenChange,
  eventId,
  bar,
  onBarUpdated,
}: Props) {
  const token = useAuthStore((s) => s.token)
  const [menuProducts, setMenuProducts] = useState<BarMenuProductRow[]>([])
  const [inventoryItems, setInventoryItems] = useState<BarInventoryItemRow[]>([])
  const [draftStock, setDraftStock] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(
    () => new Set()
  )
  const [applyingIds, setApplyingIds] = useState<Set<string>>(() => new Set())
  const [section, setSection] = useState<
    "menu" | "stock" | "staff" | "settings"
  >("menu")
  const [editName, setEditName] = useState("")
  const [editBusy, setEditBusy] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [eventStaff, setEventStaff] = useState<EventAssignmentStaffRow[]>([])
  const [staffPendingIds, setStaffPendingIds] = useState<Set<string>>(
    () => new Set()
  )

  useEffect(() => {
    if (open && bar) {
      setEditName(bar.name)
    }
  }, [open, bar?.id, bar?.name])

  async function saveName() {
    const name = editName.trim()
    if (!token || !bar || !name || editBusy) return
    setEditBusy(true)
    try {
      await apiFetch(`/events/${eventId}/bars/${bar.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name }),
      })
      toast.success("Nombre actualizado")
      onBarUpdated?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el nombre")
    } finally {
      setEditBusy(false)
    }
  }

  async function toggleStatus() {
    if (!token || !bar || toggleBusy) return
    const nextActive = bar.isActive === false
    setToggleBusy(true)
    try {
      await apiFetch(`/events/${eventId}/bars/${bar.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: nextActive }),
      })
      toast.success(nextActive ? "Barra reactivada" : "Barra desactivada")
      onBarUpdated?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el estado")
    } finally {
      setToggleBusy(false)
    }
  }

  function addApplying(id: string) {
    setApplyingIds((prev) => new Set(prev).add(id))
  }

  function removeApplying(id: string) {
    setApplyingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const loadAll = useCallback(async () => {
    if (!token || !bar) return
    setLoading(true)
    setLoadError(null)
    try {
      const q = new URLSearchParams({ eventId })
      const [menuRes, invRes, staffRes] = await Promise.all([
        apiFetch<BarMenuProductsApiResponse>(
          `/bars/${bar.id}/products?${q.toString()}`,
          { method: "GET", token }
        ),
        apiFetch<BarInventoryApiResponse>(`/bars/${bar.id}/inventory`, {
          method: "GET",
          token,
        }),
        apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, {
          method: "GET",
          token,
        }),
      ])
      setMenuProducts(menuRes.products)
      setInventoryItems(invRes.items)
      setEventStaff(staffRes.staff)
      setDraftStock(
        Object.fromEntries(
          invRes.items.map((i) => [
            i.inventoryItemId,
            hasBottlePackage(i)
              ? stockBaseToBottleDraft(i.barCurrentStock, i.packageSize)
              : i.barCurrentStock,
          ])
        )
      )
    } catch (e) {
      setMenuProducts([])
      setInventoryItems([])
      setEventStaff([])
      setDraftStock({})
      setLoadError(
        e instanceof ApiError ? e.message : "No se pudo cargar la configuración"
      )
    } finally {
      setLoading(false)
    }
  }, [token, bar, eventId])

  useEffect(() => {
    if (open && bar) {
      void loadAll()
      setSection("menu")
    }
  }, [open, bar, loadAll])

  function addProductPending(id: string) {
    setPendingProductIds((prev) => new Set(prev).add(id))
  }

  function removeProductPending(id: string) {
    setPendingProductIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function onProductToggle(p: BarMenuProductRow, next: boolean) {
    if (!token || !bar || pendingProductIds.has(p.id)) return
    const prev = menuProducts
    setMenuProducts((rows) =>
      rows.map((r) => (r.id === p.id ? { ...r, isActiveForBar: next } : r))
    )
    addProductPending(p.id)
    try {
      await apiFetch(`/bars/${bar.id}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: p.id, isActive: next }),
      })
    } catch (e) {
      setMenuProducts(prev)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el menú"
      )
    } finally {
      removeProductPending(p.id)
    }
  }

  async function applyStockFromSlider(item: BarInventoryItemRow) {
    if (!token || !bar || applyingIds.has(item.inventoryItemId)) return
    const n = parseBottlesDraft(item, draftStock[item.inventoryItemId])
    if (Number.isNaN(n) || n < 0) {
      toast.error("Cantidad no válida")
      return
    }
    if (item.barInventoryRowId == null && n === 0) {
      toast.message("Mové el deslizador a más de 0 para asignar caja a la barra")
      return
    }
    const usePackages = hasBottlePackage(item)
    const committedBar = parseBottlesDraft(item, undefined)
    const maxAllowed = committedBar + bottlesInDepot(item)
    if (n > maxAllowed) {
      toast.error("No hay stock suficiente en depósito")
      return
    }

    const prevDrafts = draftStock
    addApplying(item.inventoryItemId)

    try {
      await apiFetch<{ ok: boolean; currentStock: string }>(
        `/bars/${bar.id}/inventory`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            inventoryItemId: item.inventoryItemId,
            stockToAddOrSet: n,
            stockInputAs: usePackages ? "PACKAGES" : "BASE_UNITS",
          }),
        }
      )
      await loadAll()
      toast.success("Stock de barra actualizado")
    } catch (e) {
      setDraftStock(prevDrafts)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el stock"
      )
    } finally {
      removeApplying(item.inventoryItemId)
    }
  }

  async function onStaffBarToggle(member: EventAssignmentStaffRow, checked: boolean) {
    if (!token || !bar || !member.isAssigned) return
    setStaffPendingIds((prev) => new Set(prev).add(member.id))
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({
          staffId: member.id,
          isAssigned: true,
          barId: checked ? bar.id : null,
        }),
      })
      toast.success(
        checked ? "Asignado a esta barra" : "Quitado de esta barra"
      )
      onBarUpdated?.()
      await loadAll()
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar la asignación"
      )
    } finally {
      setStaffPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(member.id)
        return next
      })
    }
  }

  async function releaseBarStockToGlobalPool(item: BarInventoryItemRow) {
    if (!token || !bar || item.barInventoryRowId == null) return
    addApplying(item.inventoryItemId)
    try {
      await apiFetch(
        `/bars/${bar.id}/inventory/${item.inventoryItemId}`,
        { method: "DELETE", token }
      )
      toast.success("Esta barra consumirá desde el depósito global del evento")
      setDraftStock((d) => {
        const next = { ...d }
        delete next[item.inventoryItemId]
        return next
      })
      await loadAll()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar")
    } finally {
      removeApplying(item.inventoryItemId)
    }
  }

  if (!bar) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-zinc-200/50 bg-[#F2F2F7] p-0 dark:border-zinc-800/50 dark:bg-black sm:max-w-xl"
      >
        <SheetHeader className="border-b border-zinc-200/50 bg-white/70 px-5 py-6 pr-14 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
              <SlidersHorizontal className="h-6 w-6 text-[#FF9500]" />
            </span>
            <div className="min-w-0 text-left">
              <SheetTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                Configurar barra
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                <span className="font-semibold text-black dark:text-white">
                  {bar.name}
                </span>{" "}
                · Menú del evento y stock físico asignado a este punto de venta.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center px-5 py-14 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            Cargando…
          </div>
        ) : loadError ? (
          <div className="mx-5 my-5 rounded-2xl border border-red-200/60 bg-red-50 px-4 py-3 text-[15px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {loadError}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-5 pt-5">
              <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200/50 bg-white p-1 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                {(
                  [
                    { id: "menu" as const, label: "Menú" },
                    { id: "stock" as const, label: "Stock" },
                    { id: "staff" as const, label: "Personal" },
                    { id: "settings" as const, label: "Ajustes" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSection(t.id)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-200 active:opacity-50",
                      section === t.id
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "text-[#8E8E93] hover:bg-[#F2F2F7] dark:text-[#98989D] dark:hover:bg-zinc-800/50"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {section === "settings" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-8">
                  <div className="rounded-2xl border border-zinc-200/50 bg-white p-5 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                    <label
                      className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
                      htmlFor="bar-settings-name"
                    >
                      Nombre de la barra
                    </label>
                    <Input
                      id="bar-settings-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={cn("mt-3", inputClass)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveName()
                      }}
                    />
                    <Button
                      type="button"
                      disabled={!editName.trim() || editBusy}
                      onClick={() => void saveName()}
                      className="mt-4 h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
                    >
                      {editBusy ? "Guardando…" : "Guardar cambios"}
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-red-200/40 bg-white p-5 dark:border-red-900/40 dark:bg-[#1C1C1E]">
                    <h4 className="text-[15px] font-semibold text-black dark:text-white">
                      Estado de la barra
                    </h4>
                    <p className="mt-2 text-[14px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                      Si desactivás la barra, no se podrán asignar más ventas ni stock a este punto.
                    </p>
                    {bar.isActive !== false ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={toggleBusy}
                        onClick={() => void toggleStatus()}
                        className="mt-4 h-11 w-full rounded-xl font-semibold"
                      >
                        {toggleBusy ? "…" : "Desactivar barra"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={toggleBusy}
                        onClick={() => void toggleStatus()}
                        className="mt-4 h-11 w-full rounded-xl border-emerald-600/40 font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-400"
                      >
                        {toggleBusy ? "…" : "Reactivar barra"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : section === "menu" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {menuProducts.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay productos activos en el menú del evento. Activá productos en{" "}
                    <span className="font-semibold text-black dark:text-white">
                      Stock &amp; Barras
                    </span>
                    .
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/50 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white dark:divide-zinc-800/50 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                    {menuProducts.map((p) => {
                      const busy = pendingProductIds.has(p.id)
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 active:bg-[#F2F2F7]/80 dark:active:bg-zinc-800/40"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF9500]/15">
                            <Package className="h-4 w-4 text-[#FF9500]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight text-black dark:text-white">
                              {p.name}
                            </p>
                            <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                              {formatMoneyArs(p.price)}
                            </p>
                          </div>
                          <Switch
                            checked={p.isActiveForBar}
                            disabled={busy}
                            onCheckedChange={(v) => void onProductToggle(p, v)}
                            aria-label={
                              p.isActiveForBar
                                ? `Quitar ${p.name} del menú de la barra`
                                : `Vender ${p.name} en esta barra`
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : section === "staff" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {eventStaff.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay personal en la Productora para este tenant.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/50 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white dark:divide-zinc-800/50 dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
                    {eventStaff.map((member) => {
                      const busy = staffPendingIds.has(member.id)
                      const onThisBar = member.barId === bar.id
                      return (
                        <li
                          key={member.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-200 active:bg-[#F2F2F7]/80 dark:active:bg-zinc-800/40"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF9500]/15">
                            <Users className="h-4 w-4 text-[#FF9500]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight text-black dark:text-white">
                              {member.name}
                            </p>
                            <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                              {staffRoleLabel(member.role)}
                            </p>
                          </div>
                          {!member.isAssigned ? (
                            <span className="max-w-[200px] text-right text-[12px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                              Activá primero el turno en la pestaña Personal del evento.
                            </span>
                          ) : (
                            <Switch
                              checked={onThisBar}
                              disabled={busy}
                              onCheckedChange={(v) =>
                                void onStaffBarToggle(member, v)
                              }
                              aria-label={
                                onThisBar
                                  ? `Quitar a ${member.name} de esta barra`
                                  : `Asignar a ${member.name} a esta barra`
                              }
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : section === "stock" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {inventoryItems.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay insumos en el catálogo. Agregalos en{" "}
                    <span className="font-semibold text-black dark:text-white">
                      Stock &amp; Barras
                    </span>{" "}
                    o en Inventario PRO.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {inventoryItems.map((item) => {
                      const applying = applyingIds.has(item.inventoryItemId)
                      const hasRow = item.barInventoryRowId != null
                      const committed = parseBottlesDraft(item, undefined)
                      const depot = bottlesInDepot(item)
                      const maxB = committed + depot
                      const v = Math.min(
                        maxB,
                        parseBottlesDraft(
                          item,
                          draftStock[item.inventoryItemId]
                        )
                      )
                      const labelUnit = hasBottlePackage(item) ? "botellas" : "uds."
                      const isChanged = v !== committed
                      return (
                        <li
                          key={item.inventoryItemId}
                          className="rounded-2xl border border-zinc-200/50 bg-white p-4 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"
                        >
                          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <p className="font-semibold text-black dark:text-white">
                              {item.name}
                            </p>
                            <div className="text-right text-[13px]">
                              <span
                                className={cn(
                                  "transition-colors duration-200",
                                  isChanged
                                    ? "font-semibold text-[#FF9500]"
                                    : "text-foreground"
                                )}
                              >
                                {v} {labelUnit} en barra{" "}
                                {isChanged && "(Sin guardar)"}
                              </span>
                              <span className="text-[#8E8E93] dark:text-[#98989D]">
                                {" "}
                                · {maxB - v} {labelUnit} libres en
                                depósito
                              </span>
                            </div>
                          </div>
                          <Slider
                            min={0}
                            max={Math.max(0, maxB)}
                            step={1}
                            value={v}
                            disabled={applying || maxB === 0}
                            onValueChange={(n) =>
                              setDraftStock((d) => ({
                                ...d,
                                [item.inventoryItemId]: String(n),
                              }))
                            }
                            className="mb-3"
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {hasRow ? (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={applying}
                                onClick={() => void releaseBarStockToGlobalPool(item)}
                                className="h-10 rounded-xl border-zinc-300 dark:border-zinc-600"
                              >
                                Usar stock global del evento
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              disabled={applying}
                              onClick={() => void applyStockFromSlider(item)}
                              className="h-10 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white"
                            >
                              {applying ? "…" : "Aplicar"}
                            </Button>
                          </div>
                          {!hasRow ? (
                            <p className="mt-2 text-[12px] text-[#8E8E93] dark:text-[#98989D]">
                              Con 0 {labelUnit} y sin aplicar, el POS descuenta del
                              depósito. Subí y aplicá para fijar caja en barra.
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
