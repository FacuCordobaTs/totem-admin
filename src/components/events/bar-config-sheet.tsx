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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  trackStock?: boolean
  bar: EventBarRow | null
  onBarUpdated?: () => void
}

export function BarConfigSheet({
  open,
  onOpenChange,
  eventId,
  trackStock = true,
  bar,
  onBarUpdated,
}: Props) {
  const token = useAuthStore((s) => s.token)
  const [menuProducts, setMenuProducts] = useState<BarMenuProductRow[]>([])
  const [catalogProducts, setCatalogProducts] = useState<ApiProduct[]>([])
  const [inventoryItems, setInventoryItems] = useState<BarInventoryItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
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
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [pickerIds, setPickerIds] = useState<Set<string>>(() => new Set())
  const [pickerSaving, setPickerSaving] = useState(false)
  const [stockProductId, setStockProductId] = useState<string | null>(null)
  const [barStockDrafts, setBarStockDrafts] = useState<Record<string, string>>({})
  const [eventStockAddDrafts, setEventStockAddDrafts] = useState<Record<string, string>>({})
  const [stockSaving, setStockSaving] = useState(false)

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
        trackStock
          ? apiFetch<BarInventoryApiResponse>(`/bars/${barId}/inventory`, {
              method: "GET",
              token,
            })
          : Promise.resolve({ items: [] } as BarInventoryApiResponse),
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
    } catch (e) {
      setMenuProducts([])
      setInventoryItems([])
      setEventStaff([])
      setAllBars([])
      setCatalogProducts([])
      setLoadError(
        e instanceof ApiError ? e.message : "No se pudo cargar la configuración"
      )
    } finally {
      setLoading(false)
    }
  }, [token, barId, eventId, trackStock])

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

  function openProductPicker() {
    setPickerIds(new Set(menuProducts.filter((p) => p.isActiveForBar).map((p) => p.id)))
    setProductPickerOpen(true)
  }

  async function saveProductPicker(closeDialog = false) {
    if (!token || !bar || pickerSaving) return
    setPickerSaving(true)
    try {
      const eventActiveIds = new Set(menuProducts.map((p) => p.id))
      const currentBarIds = new Set(menuProducts.filter((p) => p.isActiveForBar).map((p) => p.id))
      // Al asignarlo a la barra, un producto fuera del menú queda habilitado para el evento.
      for (const productId of pickerIds) {
        if (!eventActiveIds.has(productId)) {
          await apiFetch(`/events/${eventId}/products/toggle`, {
            method: "POST", token, body: JSON.stringify({ productId, isActive: true }),
          })
        }
      }
      for (const productId of new Set([...currentBarIds, ...pickerIds])) {
        const isActive = pickerIds.has(productId)
        if (currentBarIds.has(productId) !== isActive) {
          await apiFetch(`/bars/${bar.id}/products/toggle`, {
            method: "POST", token, body: JSON.stringify({ productId, isActive }),
          })
        }
      }
      await loadAll()
      onBarUpdated?.()
      setProductPickerOpen(false)
      if (closeDialog) onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron guardar los productos")
    } finally {
      setPickerSaving(false)
    }
  }

  function handleDialogChange(nextOpen: boolean) {
    if (!nextOpen && productPickerOpen) {
      void saveProductPicker(true)
      return
    }
    onOpenChange(nextOpen)
  }

  function openProductStock(product: ApiProduct) {
    setStockProductId(product.id)
    setBarStockDrafts(Object.fromEntries(product.recipes.map((line) => {
      const item = inventoryItems.find((row) => row.inventoryItemId === line.inventoryItemId)
      return [line.inventoryItemId, item ? String(parseBottlesDraft(item, undefined)) : "0"]
    })))
    setEventStockAddDrafts({})
  }

  async function saveProductStock(product: ApiProduct) {
    if (!token || !bar || stockSaving) return
    setStockSaving(true)
    try {
      // Primero ingresa mercadería al pool del evento; después se distribuye físicamente a la barra.
      for (const line of product.recipes) {
        const add = Number.parseFloat((eventStockAddDrafts[line.inventoryItemId] ?? "").replace(",", "."))
        if (Number.isFinite(add) && add > 0) {
          await apiFetch(`/events/${eventId}/purchases`, {
            method: "POST", token,
            body: JSON.stringify({ inventoryItemId: line.inventoryItemId, quantity: add }),
          })
        }
      }
      await loadAll()
      for (const line of product.recipes) {
        const item = inventoryItems.find((row) => row.inventoryItemId === line.inventoryItemId)
        if (!item) continue
        const quantity = Number.parseFloat((barStockDrafts[line.inventoryItemId] ?? "0").replace(",", "."))
        if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Cantidad de stock inválida")
        await apiFetch(`/bars/${bar.id}/inventory`, {
          method: "PATCH", token,
          body: JSON.stringify({ inventoryItemId: item.inventoryItemId, stockToAddOrSet: quantity, stockInputAs: hasBottlePackage(item) ? "PACKAGES" : "BASE_UNITS" }),
        })
      }
      await loadAll()
      onBarUpdated?.()
      setStockProductId(null)
      toast.success("Stock actualizado")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo actualizar el stock")
    } finally { setStockSaving(false) }
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
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="flex max-h-[88vh] w-full max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-black p-0 text-white">
        {productPickerOpen ? (
          <>
            <DialogHeader className="border-b border-white/[0.06] px-5 py-5 text-left">
              <button type="button" onClick={() => void saveProductPicker()} className="mb-3 inline-flex w-fit items-center gap-1 text-[13px] text-white/45 transition-colors hover:text-white"><span aria-hidden>←</span> Volver</button>
              <DialogTitle className="text-[22px] font-bold text-white">Asignar productos</DialogTitle>
              <DialogDescription className="mt-1 text-[14px] text-white/45">{bar.name} · Los productos nuevos se activan también para el evento.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {[{ title: "Activos para el evento", products: catalogProducts.filter((p) => menuProducts.some((m) => m.id === p.id)) }, { title: "No activos para el evento", products: catalogProducts.filter((p) => !menuProducts.some((m) => m.id === p.id)) }].map((group) => (
                <div key={group.title}><p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-white/35">{group.title}</p><div className="overflow-hidden rounded-xl border border-white/[0.07]">{group.products.length === 0 ? <p className="px-3 py-3 text-sm text-white/30">Sin productos</p> : group.products.map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-sm text-white/75 last:border-0 hover:bg-white/[0.04]"><input type="checkbox" checked={pickerIds.has(product.id)} onChange={(e) => setPickerIds((previous) => { const next = new Set(previous); if (e.target.checked) next.add(product.id); else next.delete(product.id); return next })} className="accent-[#FF9500]" /><span>{product.name}</span></label>)}</div></div>
              ))}
            </div>
            <div className="border-t border-white/[0.06] p-4 text-right"><Button type="button" disabled={pickerSaving} onClick={() => void saveProductPicker()} className="h-10 rounded-xl bg-[#FF9500] px-5 text-white hover:bg-[#FF9500]/90">{pickerSaving ? "Guardando…" : "Guardar"}</Button></div>
          </>
        ) : <>
        <DialogHeader className="border-b border-white/[0.06] px-5 py-6 pr-14">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
              <SlidersHorizontal className="h-6 w-6 text-white/30" />
            </span>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-[22px] font-bold tracking-tight text-white">
                Configurar barra
              </DialogTitle>
              <DialogDescription className="mt-1 text-[15px] leading-relaxed text-[#98989D]">
                <span className="font-semibold text-white">
                  {bar.name}
                </span>{" "}
                {trackStock
                  ? "· Menú del evento y stock físico asignado a este punto de venta."
                  : "· Menú y personal de este punto de venta."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

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
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[13px] text-white/40">Productos asignados a esta barra</p>
                  <Button type="button" onClick={openProductPicker} className="h-8 rounded-lg bg-[#FF9500] px-3 text-[12px] font-semibold text-white hover:bg-[#FF9500]/90">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Asignar productos
                  </Button>
                </div>
                {menuProducts.filter((p) => p.isActiveForBar).length === 0 ? (
                  <p className="py-10 text-center text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                    No hay productos activos en el menú del evento.
                  </p>
                ) : (
                  <ul className="rounded-2xl bg-white/[0.04]">
                    {menuProducts.filter((p) => p.isActiveForBar).map((p) => {
                      const catalogProduct = catalogProducts.find((c) => c.id === p.id)

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
                            {trackStock && catalogProduct?.recipes.length ? (
                              <div className="relative shrink-0">
                                <Button type="button" onClick={() => openProductStock(catalogProduct)} className="h-8 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 text-[12px] text-white/70 hover:bg-white/[0.08]">
                                  Asignar stock
                                </Button>
                                {stockProductId === p.id ? (
                                  <Dialog open onOpenChange={(next) => { if (!next) setStockProductId(null) }}>
                                    <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-white/[0.12] bg-black p-0 text-white">
                                      <DialogHeader className="border-b border-white/[0.06] px-5 py-5 text-left"><DialogTitle className="text-xl text-white">Stock · {p.name}</DialogTitle><DialogDescription className="text-sm text-white/45">Asigná el stock físico de esta barra.</DialogDescription></DialogHeader>
                                      <div className="space-y-3 px-5 py-4">{catalogProduct.recipes.map((line) => { const item = inventoryItems.find((row) => row.inventoryItemId === line.inventoryItemId); if (!item) return <p key={line.id} className="text-sm text-white/35">{line.inventoryItemName}: sin inventario.</p>; const unit = hasBottlePackage(item) ? "botellas" : "unidades"; return <div key={line.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-sm font-medium text-white/80">{item.name}</p><p className="mt-0.5 text-xs text-white/40">Asignado al evento: {hasBottlePackage(item) ? stockBaseToBottleDraft(item.eventStockAllocated, item.packageSize) : item.eventStockAllocated} {unit}</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-white/45">En esta barra<Input type="number" min="0" inputMode="decimal" value={barStockDrafts[item.inventoryItemId] ?? "0"} onChange={(e) => setBarStockDrafts((d) => ({ ...d, [item.inventoryItemId]: e.target.value }))} className="mt-1 h-9 border-white/[0.1] bg-white/[0.04] text-sm" /></label><label className="text-xs text-white/45">Sumar al evento<Input type="number" min="0" inputMode="decimal" placeholder="0" value={eventStockAddDrafts[item.inventoryItemId] ?? ""} onChange={(e) => setEventStockAddDrafts((d) => ({ ...d, [item.inventoryItemId]: e.target.value }))} className="mt-1 h-9 border-white/[0.1] bg-white/[0.04] text-sm" /></label></div></div> })}</div>
                                      <div className="border-t border-white/[0.06] p-4 text-right"><Button type="button" disabled={stockSaving} onClick={() => void saveProductStock(catalogProduct)} className="h-10 rounded-xl bg-[#FF9500] px-5 text-white hover:bg-[#FF9500]/90">{stockSaving ? "Guardando…" : "Guardar stock"}</Button></div>
                                    </DialogContent>
                                  </Dialog>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}
        <div className="shrink-0 border-t border-white/[0.06] bg-black p-4 text-right">
          <Button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl bg-[#FF9500] px-5 text-white hover:bg-[#FF9500]/90">
            Guardar
          </Button>
        </div>
        </>}
      </DialogContent>
    </Dialog>
  )
}
