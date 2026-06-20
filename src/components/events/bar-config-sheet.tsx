import { useCallback, useEffect, useRef, useState } from "react"
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
  EventBarsResponse,
  EventStaffListResponse,
} from "@/types/event-dashboard"
import type { ApiProduct } from "@/components/inventory/recipe-config"
import { staffRoleLabel } from "@/lib/role-labels"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Package,
  Plus,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { hasBottlePackage, stockBaseToBottleDraft } from "@/lib/inventory-units"
import { Input } from "@/components/ui/input"

const inputClass =
  "h-11 rounded-xl border-white/[0.1] bg-white/[0.05] px-4 text-[15px] transition-all duration-200 focus-visible:border-white/20 focus-visible:ring-0"

type ProductsApi = { products: ApiProduct[] }

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

function StockSlider({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number
  max: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="relative flex h-3 select-none items-center">
      {/* Track */}
      <div className="absolute inset-x-0 h-[2px] rounded-full bg-white/[0.08]" />
      {/* Fill */}
      <div
        className="absolute left-0 h-[2px] rounded-full bg-[#FF9500] transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
      {/* Thumb */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 transition-[left] duration-75"
        style={{ left: `${pct}%` }}
        aria-hidden
      >
        <div className="h-3 w-3 rounded-full bg-[#FF9500] shadow-sm shadow-black/30" />
      </div>
      {/* Native input overlay for interaction */}
      <input
        type="range"
        min={0}
        max={max || 1}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  )
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
  const [catalogProducts, setCatalogProducts] = useState<ApiProduct[]>([])
  const [inventoryItems, setInventoryItems] = useState<BarInventoryItemRow[]>([])
  const [draftStock, setDraftStock] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(
    () => new Set()
  )
  const [applyingIds, setApplyingIds] = useState<Set<string>>(() => new Set())
  const [section, setSection] = useState<"menu" | "staff" | "settings">("menu")
  const [editName, setEditName] = useState("")
  const [editBusy, setEditBusy] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [eventStaff, setEventStaff] = useState<EventAssignmentStaffRow[]>([])
  const [allBars, setAllBars] = useState<{ id: string; name: string }[]>([])
  const [staffPendingIds, setStaffPendingIds] = useState<Set<string>>(
    () => new Set()
  )
  const openedBarIdRef = useRef<string | null>(null)
  const [showCreateStaff, setShowCreateStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: "", email: "", password: "", role: "BARTENDER" as "ADMIN" | "MANAGER" | "BARTENDER" | "SECURITY" })
  const [createStaffBusy, setCreateStaffBusy] = useState(false)

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

  const barId = bar?.id ?? null

  const loadAll = useCallback(async () => {
    if (!token || !barId) return
    setLoading(true)
    setLoadError(null)
    try {
      const q = new URLSearchParams({ eventId })
      const [menuRes, invRes, staffRes, barsRes, productsRes] = await Promise.all([
        apiFetch<BarMenuProductsApiResponse>(
          `/bars/${barId}/products?${q.toString()}`,
          { method: "GET", token }
        ),
        apiFetch<BarInventoryApiResponse>(`/bars/${barId}/inventory`, {
          method: "GET",
          token,
        }),
        apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, {
          method: "GET",
          token,
        }),
        apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
          method: "GET",
          token,
        }),
        apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
      ])
      setMenuProducts(menuRes.products)
      setInventoryItems(invRes.items)
      setEventStaff(staffRes.staff)
      setAllBars(barsRes.bars.map((b) => ({ id: b.id, name: b.name })))
      setCatalogProducts(productsRes.products)
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
      setAllBars([])
      setCatalogProducts([])
      setDraftStock({})
      setLoadError(
        e instanceof ApiError ? e.message : "No se pudo cargar la configuración"
      )
    } finally {
      setLoading(false)
    }
  }, [token, barId, eventId])

  useEffect(() => {
    if (open && barId) {
      void loadAll()
      if (openedBarIdRef.current !== barId) {
        setSection("menu")
        openedBarIdRef.current = barId
      }
    }
    if (!open) {
      openedBarIdRef.current = null
    }
  }, [open, barId, loadAll])

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
      toast.message("Ingresá una cantidad mayor a 0 para asignar stock a la barra")
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

  async function assignStaff(
    member: EventAssignmentStaffRow,
    opts: { isAssigned: boolean; barId?: string | null }
  ) {
    if (!token) return
    setStaffPendingIds((prev) => new Set(prev).add(member.id))
    setEventStaff((prev) =>
      prev.map((s) =>
        s.id === member.id
          ? { ...s, isAssigned: opts.isAssigned, barId: opts.barId ?? (opts.isAssigned ? s.barId : null) }
          : s
      )
    )
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({
          staffId: member.id,
          isAssigned: opts.isAssigned,
          barId: opts.barId ?? null,
        }),
      })
      onBarUpdated?.()
      await loadAll()
    } catch (e) {
      await loadAll()
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la asignación")
    } finally {
      setStaffPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(member.id)
        return next
      })
    }
  }

  async function submitCreateStaff() {
    const { name, email, password, role } = newStaff
    if (!token || !barId || !name.trim() || !email.trim() || !password.trim() || createStaffBusy) return
    setCreateStaffBusy(true)
    try {
      const res = await apiFetch<{ staff: { id: string } }>("/staff/team", {
        method: "POST",
        token,
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      })
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({ staffId: res.staff.id, isAssigned: true, barId }),
      })
      toast.success("Personal creado y asignado a esta barra")
      setNewStaff({ name: "", email: "", password: "", role: "BARTENDER" })
      setShowCreateStaff(false)
      onBarUpdated?.()
      await loadAll()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear el personal")
    } finally {
      setCreateStaffBusy(false)
    }
  }

  if (!bar) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-white/[0.06] bg-[#0a0a0a] p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-white/[0.06] px-5 py-6 pr-14">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
              <SlidersHorizontal className="h-6 w-6 text-white/30" />
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
              <div className="flex flex-wrap gap-1 rounded-xl bg-white/[0.05] p-1">
                {(
                  [
                    { id: "menu" as const, label: "Menú" },
                    { id: "staff" as const, label: "Personal" },
                    { id: "settings" as const, label: "Ajustes" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSection(t.id)}
                    className={cn(
                      "cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-200 active:opacity-50",
                      section === t.id
                        ? "bg-white/[0.10] text-white"
                        : "text-white/35 hover:bg-white/[0.06] hover:text-white/60"
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
                  <div className="rounded-2xl bg-white/[0.04] p-5">
                    <label
                      className="text-[13px] font-normal text-white/45"
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

                  <div className="rounded-2xl bg-white/[0.04] p-5">
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
            ) : section === "staff" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-4">
                  {eventStaff.length === 0 ? (
                    <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                      No hay personal en la Productora todavía.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04]">
                      {[...eventStaff]
                        .sort((a, b) => {
                          const score = (m: EventAssignmentStaffRow) =>
                            m.barId === barId ? 0 : m.isAssigned ? 1 : 2
                          return score(a) - score(b)
                        })
                        .map((member) => {
                          const busy = staffPendingIds.has(member.id)
                          const inEvent = member.isAssigned

                          return (
                            <li
                              key={member.id}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 transition-colors duration-200",
                                !inEvent && "opacity-45"
                              )}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                                <Users className="h-3.5 w-3.5 text-white/30" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold leading-tight text-black dark:text-white">
                                  {member.name}
                                </p>
                                <p className="mt-0.5 text-[12px] text-[#8E8E93] dark:text-[#98989D]">
                                  {staffRoleLabel(member.role)}
                                </p>
                              </div>

                              {inEvent ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Select
                                    value={member.barId ?? "none"}
                                    disabled={busy}
                                    onValueChange={(v) =>
                                      void assignStaff(member, {
                                        isAssigned: true,
                                        barId: v === "none" ? null : v,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-[130px] rounded-xl border-white/[0.10] bg-white/[0.04] text-[12px] text-white/70 focus:ring-0">
                                      <SelectValue placeholder="Sin barra" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Sin barra</SelectItem>
                                      {allBars.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                          {b.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void assignStaff(member, { isAssigned: false, barId: null })}
                                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-xl text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-40"
                                    aria-label={`Quitar a ${member.name} del evento`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void assignStaff(member, { isAssigned: true, barId })}
                                  className="cursor-pointer shrink-0 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/40 transition-all hover:border-white/20 hover:text-white/70 disabled:opacity-40"
                                >
                                  + Turno
                                </button>
                              )}
                            </li>
                          )
                        })}
                    </ul>
                  )}

                  {showCreateStaff ? (
                    <div className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-white/70">Nuevo personal</p>
                        <button
                          type="button"
                          onClick={() => { setShowCreateStaff(false); setNewStaff({ name: "", email: "", password: "", role: "BARTENDER" }) }}
                          className="text-white/30 hover:text-white/60 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <Input
                        placeholder="Nombre"
                        value={newStaff.name}
                        onChange={(e) => setNewStaff((p) => ({ ...p, name: e.target.value }))}
                        className={inputClass}
                      />
                      <Input
                        placeholder="Email"
                        type="email"
                        value={newStaff.email}
                        onChange={(e) => setNewStaff((p) => ({ ...p, email: e.target.value }))}
                        className={inputClass}
                      />
                      <Input
                        placeholder="Contraseña (mín. 8 caracteres)"
                        type="password"
                        value={newStaff.password}
                        onChange={(e) => setNewStaff((p) => ({ ...p, password: e.target.value }))}
                        className={inputClass}
                      />
                      <Select
                        value={newStaff.role}
                        onValueChange={(v) => setNewStaff((p) => ({ ...p, role: v as typeof newStaff.role }))}
                      >
                        <SelectTrigger className={inputClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BARTENDER">Bartender</SelectItem>
                          <SelectItem value="SECURITY">Seguridad</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        disabled={!newStaff.name.trim() || !newStaff.email.trim() || newStaff.password.length < 8 || createStaffBusy}
                        onClick={() => void submitCreateStaff()}
                        className="h-10 w-full rounded-xl bg-[#FF9500] text-[14px] font-semibold text-white hover:opacity-95 active:opacity-50"
                      >
                        {createStaffBusy ? "Creando…" : "Crear y asignar a esta barra"}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCreateStaff(true)}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-xl border border-dashed border-white/[0.10] px-4 py-3 text-[13px] text-white/35 transition-colors hover:border-white/20 hover:text-white/60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nuevo personal
                    </button>
                  )}
                </div>
              </div>
            ) : section === "menu" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {menuProducts.length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay productos activos en el menú del evento.
                  </p>
                ) : (
                  <ul className="overflow-hidden rounded-2xl bg-white/[0.04]">
                    {menuProducts.map((p) => {
                      const busy = pendingProductIds.has(p.id)
                      const catalogProduct = catalogProducts.find((c) => c.id === p.id)
                      const hasRecipe = (catalogProduct?.recipes.length ?? 0) > 0
                      // Products in this bar's menu are auto-expanded; others stay collapsed.
                      const isExpanded = p.isActiveForBar && hasRecipe

                      return (
                        <li key={p.id} className="border-b border-white/[0.06] last:border-0">
                          {/* Product row */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                              <Package className="h-4 w-4 text-white/30" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-tight text-black dark:text-white">
                                {p.name}
                              </p>
                              <p className="mt-0.5 text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                                {formatMoneyArs(p.price)}
                              </p>
                            </div>
                            {/* Add to / remove from menu */}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onProductToggle(p, !p.isActiveForBar)}
                              className={cn(
                                "cursor-pointer flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all active:opacity-70 disabled:opacity-40",
                                p.isActiveForBar
                                  ? "border border-white/[0.12] bg-transparent text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                                  : "bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
                              )}
                              aria-label={
                                p.isActiveForBar ? "Quitar del menú" : "Agregar al menú"
                              }
                            >
                              {p.isActiveForBar ? (
                                <X className="h-4 w-4" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {/* Inline stock config */}
                          {isExpanded && catalogProduct && (
                            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
                              {catalogProduct.recipes.length === 0 ? (
                                <p className="text-[13px] text-white/30">
                                  Sin receta configurada.
                                </p>
                              ) : (
                                <div className="divide-y divide-white/[0.05]">
                                  {catalogProduct.recipes.map((line) => {
                                    const item = inventoryItems.find(
                                      (i) => i.inventoryItemId === line.inventoryItemId
                                    )
                                    if (!item) {
                                      return (
                                        <div
                                          key={line.id}
                                          className="rounded-xl bg-white/[0.03] px-4 py-3"
                                        >
                                          <p className="text-[13px] font-semibold text-white/40">
                                            {line.inventoryItemName}
                                          </p>
                                          <p className="mt-0.5 text-[12px] text-white/20">
                                            Sin stock asignado al evento.
                                          </p>
                                        </div>
                                      )
                                    }
                                    const applying = applyingIds.has(item.inventoryItemId)
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
                                    const labelUnit = hasBottlePackage(item)
                                      ? "bot."
                                      : "uds."
                                    const isChanged = v !== committed

                                    return (
                                      <div key={line.id} className="py-2.5">
                                        {/* Name + value */}
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="truncate text-[13px] font-medium text-white/80">
                                            {item.name}
                                          </p>
                                          <div className="flex shrink-0 items-center gap-2">
                                            <span
                                              className={cn(
                                                "text-[13px] font-semibold tabular-nums transition-colors duration-150",
                                                isChanged
                                                  ? "text-[#FF9500]"
                                                  : "text-white/50"
                                              )}
                                            >
                                              {v}
                                              <span className="ml-0.5 text-[10px] font-normal text-white/30">
                                                {labelUnit}
                                              </span>
                                            </span>
                                            {isChanged && (
                                              <button
                                                type="button"
                                                disabled={applying}
                                                onClick={() =>
                                                  void applyStockFromSlider(item)
                                                }
                                                className="cursor-pointer rounded-md bg-[#FF9500] px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                              >
                                                {applying ? "…" : "Aplicar"}
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        {/* Slider */}
                                        <div className="mt-2.5">
                                          <StockSlider
                                            value={v}
                                            max={maxB}
                                            disabled={applying || maxB === 0}
                                            onChange={(n) =>
                                              setDraftStock((d) => ({
                                                ...d,
                                                [item.inventoryItemId]: String(n),
                                              }))
                                            }
                                          />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
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
