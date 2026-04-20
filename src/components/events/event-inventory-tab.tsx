import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { EventMenuProductRow, EventMenuProductsResponse } from "@/types/event-dashboard"
import { type ApiProduct, type ProductSaleType } from "@/components/inventory/recipe-config"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { RecipeIngredientRow } from "@/components/inventory/recipe-ingredient-row"
import {
  draftLineQuantityForApi,
  materialSupportsFullBottle,
  recipeApiLineToDraft,
  type RecipeDraftLine,
} from "@/lib/inventory-recipe-helpers"
import {
  bottleStockPreviewLine,
  hasBottlePackage,
  stockBaseToBottleDraft,
  unitLabel,
} from "@/lib/inventory-units"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Package, Pencil, Plus, Wine } from "lucide-react"

const inputClass =
  "h-11 rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#FF9500]/30 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

const selectTriggerClass =
  "h-11 min-w-[160px] flex-1 rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

type EventInvRow = {
  id: string
  name: string
  baseUnit: ApiInventoryItem["baseUnit"]
  packageSize: string
  eventInventoryId: string | null
  stockAllocated: string
}

type EventInventoryListResponse = {
  items: EventInvRow[]
}

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

function bottleLoadPreview(row: EventInvRow, bottles: number, perVol: number): string {
  if (!Number.isFinite(bottles) || bottles <= 0) {
    return "Ingresá la cantidad de botellas."
  }
  if (row.baseUnit === "UNIT") {
    return `Sumás ${bottles.toLocaleString("es-AR")} unidades al stock del evento.`
  }
  if (!Number.isFinite(perVol) || perVol <= 0) {
    return "Indicá ml (o g) por botella o configurá el tamaño del envase del insumo."
  }
  const total = bottles * perVol
  const u = row.baseUnit === "GRAMS" ? "g" : "ml"
  return `Estás sumando ${total.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${u} de ${row.name}.`
}

function lineIsSavable(
  l: RecipeDraftLine,
  materials: ApiInventoryItem[],
  saleType: ProductSaleType
): boolean {
  if (!l.inventoryItemId) return false
  const mat = materials.find((m) => m.id === l.inventoryItemId)
  if (l.useFullBottle && materialSupportsFullBottle(mat, saleType)) return true
  const q = Number.parseFloat(l.quantityUsed.replace(",", "."))
  return Number.isFinite(q) && q > 0
}

type MaterialKind = "liquid" | "solid" | "unit"

function kindToBaseUnit(k: MaterialKind): ApiInventoryItem["baseUnit"] {
  switch (k) {
    case "liquid":
      return "ML"
    case "solid":
      return "GRAMS"
    default:
      return "UNIT"
  }
}

type Props = {
  eventId: string
}

export function EventInventoryTab({ eventId }: Props) {
  const token = useAuthStore((s) => s.token)

  const [insumos, setInsumos] = useState<EventInvRow[]>([])
  const [insLoading, setInsLoading] = useState(true)
  const [insError, setInsError] = useState<string | null>(null)
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [stockBusy, setStockBusy] = useState<Record<string, boolean>>({})

  const [catalogProducts, setCatalogProducts] = useState<ApiProduct[]>([])
  const [eventMenuRows, setEventMenuRows] = useState<EventMenuProductRow[]>([])
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)

  const [newInsumoOpen, setNewInsumoOpen] = useState(false)
  const [newInsumoName, setNewInsumoName] = useState("")
  const [newInsumoKind, setNewInsumoKind] = useState<MaterialKind>("liquid")
  const [newInsumoPackageSize, setNewInsumoPackageSize] = useState("750")
  const [newInsumoStock, setNewInsumoStock] = useState("0")
  const [newInsumoSaving, setNewInsumoSaving] = useState(false)

  const [bottleDlgRow, setBottleDlgRow] = useState<EventInvRow | null>(null)
  const [bottleCount, setBottleCount] = useState("1")
  const [bottleMl, setBottleMl] = useState("")
  const [bottleSaving, setBottleSaving] = useState(false)

  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [cpName, setCpName] = useState("")
  const [cpPrice, setCpPrice] = useState("")
  const [cpSaleType, setCpSaleType] = useState<ProductSaleType>("GLASS")
  const [cpLines, setCpLines] = useState<RecipeDraftLine[]>([])
  const [cpSaving, setCpSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editSaleType, setEditSaleType] = useState<ProductSaleType>("GLASS")
  const [editLines, setEditLines] = useState<RecipeDraftLine[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const loadInsumos = useCallback(async () => {
    if (!token) return
    setInsLoading(true)
    setInsError(null)
    try {
      const res = await apiFetch<EventInventoryListResponse>(
        `/events/${eventId}/inventory`,
        { method: "GET", token }
      )
      setInsumos(res.items)
      setStockDrafts(
        Object.fromEntries(
          res.items.map((i) => [
            i.id,
            hasBottlePackage(i)
              ? stockBaseToBottleDraft(i.stockAllocated, i.packageSize)
              : i.stockAllocated,
          ])
        )
      )
    } catch (e) {
      setInsumos([])
      setInsError(
        e instanceof ApiError ? e.message : "No se pudo cargar el inventario del evento"
      )
    } finally {
      setInsLoading(false)
    }
  }, [token, eventId])

  const loadMenu = useCallback(async () => {
    if (!token) return
    setMenuLoading(true)
    setMenuError(null)
    try {
      const [invRes, evRes] = await Promise.all([
        apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
        apiFetch<EventMenuProductsResponse>(`/events/${eventId}/products`, {
          method: "GET",
          token,
        }),
      ])
      setCatalogProducts(invRes.products)
      setEventMenuRows(evRes.products)
    } catch (e) {
      setCatalogProducts([])
      setEventMenuRows([])
      setMenuError(
        e instanceof ApiError ? e.message : "No se pudo cargar productos del evento"
      )
    } finally {
      setMenuLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void loadInsumos()
  }, [loadInsumos])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

  async function patchStock(row: EventInvRow) {
    if (!token) return
    const raw = (stockDrafts[row.id] ?? row.stockAllocated).trim().replace(",", ".")
    const n = Number.parseFloat(raw)
    if (Number.isNaN(n) || n < 0) {
      toast.error("Ingresá una cantidad válida (≥ 0)")
      return
    }
    const usePackages = hasBottlePackage(row)
    setStockBusy((b) => ({ ...b, [row.id]: true }))
    try {
      await apiFetch(`/events/${eventId}/inventory`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          inventoryItemId: row.id,
          stockAllocated: n,
          stockInputAs: usePackages ? "PACKAGES" : "BASE_UNITS",
        }),
      })
      toast.success("Stock actualizado")
      await loadInsumos()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar el stock")
    } finally {
      setStockBusy((b) => ({ ...b, [row.id]: false }))
    }
  }

  async function submitNewInsumo(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setNewInsumoSaving(true)
    try {
      const baseUnit = kindToBaseUnit(newInsumoKind)
      const pkgRaw = newInsumoPackageSize.trim().replace(",", ".")
      const pkgNum = pkgRaw === "" ? 0 : Number.parseFloat(pkgRaw)
      const useBottles =
        (baseUnit === "ML" || baseUnit === "GRAMS") &&
        Number.isFinite(pkgNum) &&
        pkgNum > 0

      const body: Record<string, unknown> = {
        name: newInsumoName.trim(),
        baseUnit,
        initialStock: newInsumoStock,
        initialStockInputAs: useBottles ? "PACKAGES" : "BASE_UNITS",
      }
      if (pkgRaw !== "") {
        body.packageSize = pkgRaw
      }

      await apiFetch(`/events/${eventId}/inventory/create`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      setNewInsumoOpen(false)
      setNewInsumoName("")
      setNewInsumoKind("liquid")
      setNewInsumoPackageSize("750")
      setNewInsumoStock("0")
      toast.success("Insumo creado")
      await loadInsumos()
      await loadMenu()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el insumo"
      )
    } finally {
      setNewInsumoSaving(false)
    }
  }

  async function onToggleProduct(p: EventMenuProductRow, next: boolean) {
    if (!token || pendingToggleId === p.id) return
    const prev = eventMenuRows
    setEventMenuRows((r) =>
      r.map((x) => (x.id === p.id ? { ...x, isActiveForEvent: next } : x))
    )
    setPendingToggleId(p.id)
    try {
      await apiFetch(`/events/${eventId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: p.id, isActive: next }),
      })
    } catch (e) {
      setEventMenuRows(prev)
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el menú del evento"
      )
    } finally {
      setPendingToggleId(null)
    }
  }

  function openEdit(productId: string) {
    const full = catalogProducts.find((p) => p.id === productId)
    if (!full) return
    setEditProductId(productId)
    setEditName(full.name)
    setEditPrice(full.price)
    setEditSaleType(full.saleType ?? "GLASS")
    setEditLines(
      full.recipes.map((r) => {
        const mat = insumos.find((m) => m.id === r.inventoryItemId)
        return recipeApiLineToDraft(r, mat)
      })
    )
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!token || !editProductId) return
    setEditSaving(true)
    try {
      await apiFetch(`/inventory/products/${editProductId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          name: editName.trim(),
          price: editPrice,
          saleType: editSaleType,
          recipes: editLines
            .filter((l) => lineIsSavable(l, insumos, editSaleType))
            .map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantityUsed: draftLineQuantityForApi(
                l,
                insumos.find((m) => m.id === l.inventoryItemId)
              ),
            })),
        }),
      })
      setEditOpen(false)
      setEditProductId(null)
      toast.success("Producto actualizado")
      await loadMenu()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar")
    } finally {
      setEditSaving(false)
    }
  }

  function addCpLine() {
    const first = insumos[0]?.id
    if (!first) {
      toast.message("Agregá al menos un insumo en la primera pestaña")
      return
    }
    setCpLines((prev) => [
      ...prev,
      { inventoryItemId: first, quantityUsed: "1", useFullBottle: false },
    ])
  }

  function addEditLine() {
    const first = insumos[0]?.id
    if (!first) return
    setEditLines((prev) => [
      ...prev,
      { inventoryItemId: first, quantityUsed: "1", useFullBottle: false },
    ])
  }

  function openBottleDialog(row: EventInvRow) {
    setBottleDlgRow(row)
    setBottleCount("1")
    const d = row.packageSize ?? ""
    setBottleMl(d === "" || d === "0.00" ? "" : String(Number.parseFloat(d)))
  }

  async function submitBottleLoad(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !bottleDlgRow) return
    const n = Number.parseInt(bottleCount, 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Cantidad de botellas inválida")
      return
    }
    let customBody: { customContentValue: number } | object = {}
    if (bottleDlgRow.baseUnit !== "UNIT") {
      const raw = bottleMl.trim()
      if (raw !== "") {
        const c = Number.parseFloat(raw.replace(",", "."))
        if (!Number.isFinite(c) || c <= 0) {
          toast.error("Volumen por botella inválido")
          return
        }
        customBody = { customContentValue: c }
      }
    }
    setBottleSaving(true)
    try {
      await apiFetch("/inventory/load-bottles", {
        method: "POST",
        token,
        body: JSON.stringify({
          inventoryItemId: bottleDlgRow.id,
          quantityOfBottles: n,
          eventId,
          ...customBody,
        }),
      })
      toast.success("Carga sumada al stock del evento")
      setBottleDlgRow(null)
      await loadInsumos()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar la carga"
      )
    } finally {
      setBottleSaving(false)
    }
  }

  async function submitCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setCpSaving(true)
    try {
      const res = await apiFetch<{ product: ApiProduct }>("/inventory/products", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: cpName.trim(),
          price: cpPrice,
          saleType: cpSaleType,
          recipes: cpLines
            .filter((l) => lineIsSavable(l, insumos, cpSaleType))
            .map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantityUsed: draftLineQuantityForApi(
                l,
                insumos.find((m) => m.id === l.inventoryItemId)
              ),
            })),
        }),
      })
      await apiFetch(`/events/${eventId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: res.product.id, isActive: true }),
      })
      setCreateProductOpen(false)
      setCpName("")
      setCpPrice("")
      setCpSaleType("GLASS")
      setCpLines([])
      toast.success("Producto creado y agregado al menú del evento")
      await loadMenu()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el producto"
      )
    } finally {
      setCpSaving(false)
    }
  }

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <h3 className="text-[20px] font-semibold tracking-tight text-foreground">Insumos</h3>
          <Button
            type="button"
            onClick={() => setNewInsumoOpen(true)}
            disabled={!token}
            className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Nuevo insumo
          </Button>
        </div>

        {insError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-base text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {insError}
          </div>
        ) : insLoading ? (
          <div className="space-y-3">
            <div className="h-14 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
            <div className="h-44 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900/50" />
          </div>
        ) : insumos.length === 0 ? (
          <Card className="rounded-2xl border border-dashed border-zinc-200/50 bg-white dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
            <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10">
                <Package className="h-7 w-7 text-[#8E8E93]" />
              </span>
              <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                Todavía no hay insumos. Creá el primero para este evento.
              </p>
              <Button
                type="button"
                onClick={() => setNewInsumoOpen(true)}
                className="h-11 rounded-xl bg-[#FF9500] px-6 text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
              >
                Nuevo insumo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                  <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Insumo
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D] sm:table-cell">
                    Unidad
                  </TableHead>
                  <TableHead className="min-w-[160px] text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Stock del evento
                  </TableHead>
                  <TableHead className="min-w-[200px] w-[220px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumos.map((row) => {
                  const busy = stockBusy[row.id]
                  return (
                    <TableRow
                      key={row.id}
                      className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                    >
                      <TableCell className="pl-6 py-3.5 font-semibold text-black dark:text-white">
                        {row.name}
                      </TableCell>
                      <TableCell className="hidden py-3.5 text-[#8E8E93] dark:text-[#98989D] sm:table-cell">
                        {unitLabel(row.baseUnit)}
                      </TableCell>
                      <TableCell className="py-3.5">
                        {hasBottlePackage(row) ? (
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                            ¿Cuántas botellas ingresan?
                          </p>
                        ) : null}
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-10 max-w-[180px] rounded-xl border-zinc-200/50 bg-white font-mono tabular-nums dark:border-zinc-800/50 dark:bg-[#1C1C1E]"
                          disabled={busy}
                          value={
                            stockDrafts[row.id] ??
                            (hasBottlePackage(row)
                              ? stockBaseToBottleDraft(row.stockAllocated, row.packageSize)
                              : row.stockAllocated)
                          }
                          onChange={(e) =>
                            setStockDrafts((d) => ({
                              ...d,
                              [row.id]: e.target.value,
                            }))
                          }
                          onBlur={() => void patchStock(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur()
                            }
                          }}
                        />
                        {hasBottlePackage(row) ? (
                          <p className="mt-1.5 text-[12px] leading-snug text-foreground/90">
                            {bottleStockPreviewLine(
                              Number.parseFloat(
                                (
                                  stockDrafts[row.id] ??
                                  stockBaseToBottleDraft(row.stockAllocated, row.packageSize)
                                )
                                  .trim()
                                  .replace(",", ".")
                              ) || 0,
                              row.packageSize,
                              row.baseUnit
                            )}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => openBottleDialog(row)}
                            className="h-10 gap-1.5 rounded-xl border-zinc-200/50 px-3 text-[13px] font-semibold dark:border-zinc-700/80"
                            title="Cargar por botellas"
                          >
                            <Wine className="h-4 w-4" />
                            Botellas
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void patchStock(row)}
                            className="h-9 rounded-lg px-4 text-[14px] font-semibold transition-all duration-200 active:opacity-50"
                          >
                            Guardar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={newInsumoOpen} onOpenChange={setNewInsumoOpen}>
          <DialogContent className="max-h-[min(90vh,760px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-md dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                  <Package className="h-6 w-6 text-[#FF9500]" />
                </span>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                    Nuevo insumo para el evento
                  </DialogTitle>
                </DialogHeader>
              </div>
            </div>
            <form onSubmit={submitNewInsumo} className="flex flex-col overflow-y-auto">
              <div className="space-y-6 p-8 pt-6">
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Nombre
                  </label>
                  <Input
                    value={newInsumoName}
                    onChange={(e) => setNewInsumoName(e.target.value)}
                    required
                    className={inputClass}
                    placeholder="Ej. Fernet 750ml"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Tipo
                  </label>
                  <Select
                    value={newInsumoKind}
                    onValueChange={(v) => setNewInsumoKind(v as MaterialKind)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                      <SelectItem value="liquid" className="rounded-lg py-2">
                        Líquido (ml)
                      </SelectItem>
                      <SelectItem value="solid" className="rounded-lg py-2">
                        Sólido (g)
                      </SelectItem>
                      <SelectItem value="unit" className="rounded-lg py-2">
                        Unidad indivisible (uds.)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    {newInsumoKind === "liquid"
                      ? "Tamaño de la botella/envase (ml)"
                      : newInsumoKind === "solid"
                        ? "Peso del envase (g)"
                        : "Unidades por paquete (opcional)"}{" "}
                    <span className="font-normal normal-case text-[#8E8E93]/80 dark:text-[#98989D]/80">
                      (opcional)
                    </span>
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newInsumoPackageSize}
                    onChange={(e) => setNewInsumoPackageSize(e.target.value)}
                    className={cn(inputClass, "font-mono")}
                    placeholder={newInsumoKind === "unit" ? "Ej. 6" : "Ej. 750"}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Stock inicial en el evento
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newInsumoStock}
                    onChange={(e) => setNewInsumoStock(e.target.value)}
                    className={cn(inputClass, "font-mono")}
                  />
                  <p className="text-[12px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                    {(() => {
                      const baseUnit = kindToBaseUnit(newInsumoKind)
                      const pkgRaw = newInsumoPackageSize.trim().replace(",", ".")
                      const pkgNum = pkgRaw === "" ? 0 : Number.parseFloat(pkgRaw)
                      const useBottles =
                        (baseUnit === "ML" || baseUnit === "GRAMS") &&
                        Number.isFinite(pkgNum) &&
                        pkgNum > 0
                      return useBottles
                        ? "La cantidad se interpreta en botellas/envases; el backend guarda ml o g totales."
                        : "La cantidad está en ml, g o unidades según el tipo."
                    })()}
                  </p>
                </div>
              </div>
              <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
                <DialogFooter className="flex-col gap-3 sm:flex-col">
                  <Button
                    type="submit"
                    disabled={newInsumoSaving}
                    className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
                  >
                    {newInsumoSaving ? "Creando…" : "Crear"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewInsumoOpen(false)}
                    className="h-11 w-full rounded-xl border-zinc-200/50 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
                  >
                    Cancelar
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bottleDlgRow != null}
          onOpenChange={(open) => {
            if (!open) setBottleDlgRow(null)
          }}
        >
          <DialogContent className="max-h-[min(90vh,760px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-md dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                  <Wine className="h-6 w-6 text-[#FF9500]" />
                </span>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                    Cargar por botellas
                  </DialogTitle>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                    Sumá stock al total del evento. Para fijar el número exacto en depósito, usá el
                    campo de la tabla y &quot;Guardar&quot;.
                  </p>
                </DialogHeader>
              </div>
            </div>
            <form onSubmit={submitBottleLoad} className="flex flex-col overflow-y-auto">
              <div className="space-y-6 p-8 pt-6">
                <p className="text-[15px] font-semibold text-black dark:text-white">
                  {bottleDlgRow?.name}
                </p>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Cantidad de botellas
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={bottleCount}
                    onChange={(e) => setBottleCount(e.target.value)}
                    className={cn(inputClass, "h-12 font-mono text-[17px]")}
                    required
                  />
                </div>
                {bottleDlgRow?.baseUnit !== "UNIT" ? (
                  <div className="space-y-3">
                    <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                      {bottleDlgRow?.baseUnit === "GRAMS"
                        ? "Peso por envase (g)"
                        : "Volumen por botella (ml)"}
                    </label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={bottleMl}
                      onChange={(e) => setBottleMl(e.target.value)}
                      className={cn(inputClass, "h-12 font-mono text-[17px]")}
                      placeholder={
                        bottleDlgRow?.packageSize &&
                        bottleDlgRow.packageSize !== "0.00"
                          ? `Predeterminado: ${bottleDlgRow.packageSize}`
                          : "Ej. 750"
                      }
                    />
                  </div>
                ) : null}
                <div className="rounded-xl border border-zinc-200/50 bg-[#F2F2F7]/80 px-4 py-3 dark:border-zinc-800/50 dark:bg-black/30">
                  <p className="text-[14px] leading-relaxed text-foreground">
                    {bottleDlgRow
                      ? bottleLoadPreview(
                          bottleDlgRow,
                          Number.parseInt(bottleCount, 10) || 0,
                          bottleMl.trim() === ""
                            ? Number.parseFloat(bottleDlgRow.packageSize ?? "0")
                            : Number.parseFloat(bottleMl.replace(",", "."))
                        )
                      : ""}
                  </p>
                </div>
              </div>
              <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
                <DialogFooter className="flex-col gap-3 sm:flex-col">
                  <Button
                    type="submit"
                    disabled={bottleSaving}
                    className="h-12 w-full rounded-xl bg-[#FF9500] text-[16px] font-semibold text-white"
                  >
                    {bottleSaving ? "Sumando…" : "Sumar al stock del evento"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBottleDlgRow(null)}
                    className="h-11 w-full rounded-xl border-zinc-200/50 dark:border-zinc-800/50"
                  >
                    Cancelar
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <h3 className="text-[20px] font-semibold tracking-tight text-foreground">Menú</h3>
          <Button
            type="button"
            onClick={() => {
              setCpLines([])
              setCpName("")
              setCpPrice("")
              setCpSaleType("GLASS")
              setCreateProductOpen(true)
            }}
            disabled={!token || insumos.length === 0}
            className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Crear producto
          </Button>
        </div>

        {menuError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-base text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {menuError}
          </div>
        ) : menuLoading ? (
          <div className="h-44 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900/50" />
        ) : eventMenuRows.length === 0 ? (
          <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            No hay productos en el catálogo.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                  <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Producto
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D] md:table-cell">
                    Precio
                  </TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    En el evento
                  </TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventMenuRows.map((p) => {
                  const disabled = pendingToggleId === p.id || p.catalogIsActive === false
                  const checked = p.isActiveForEvent && p.catalogIsActive !== false
                  return (
                    <TableRow
                      key={p.id}
                      className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                    >
                      <TableCell className="pl-6 py-3.5">
                        <p className="font-semibold leading-tight text-black dark:text-white">
                          {p.name}
                        </p>
                        {p.catalogIsActive === false ? (
                          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                            Inactivo en catálogo
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden py-3.5 text-[#8E8E93] dark:text-[#98989D] md:table-cell">
                        {formatMoneyArs(p.price)}
                        {p.priceOverride != null && p.priceOverride !== "" ? (
                          <span className="ml-2 text-xs font-medium text-[#FF9500]">
                            (evento: {formatMoneyArs(p.priceOverride)})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-3.5 text-center">
                        <Switch
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(v) => void onToggleProduct(p, v)}
                          aria-label={
                            checked
                              ? `Quitar ${p.name} del menú del evento`
                              : `Agregar ${p.name} al menú del evento`
                          }
                        />
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => openEdit(p.id)}
                          aria-label={`Editar ${p.name}`}
                          className="h-10 w-10 rounded-xl transition-all duration-200 hover:bg-zinc-500/10 active:opacity-50"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10">
                            <Pencil className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
          <DialogContent className="max-h-[min(92vh,900px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-lg dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                  <Plus className="h-6 w-6 text-[#FF9500]" />
                </span>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                    Nuevo producto
                  </DialogTitle>
                </DialogHeader>
              </div>
            </div>
            <form
              onSubmit={submitCreateProduct}
              className="flex max-h-[calc(92vh-10rem)] flex-col overflow-y-auto"
            >
              <div className="space-y-6 p-8 pt-6">
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Nombre
                  </label>
                  <Input
                    value={cpName}
                    onChange={(e) => setCpName(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Precio
                  </label>
                  <Input
                    value={cpPrice}
                    onChange={(e) => setCpPrice(e.target.value)}
                    required
                    className={cn(inputClass, "font-mono")}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Tipo de venta (stock)
                  </label>
                  <Select
                    value={cpSaleType}
                    onValueChange={(v) => setCpSaleType(v as ProductSaleType)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                      <SelectItem value="GLASS" className="rounded-lg py-2">
                        Vaso / medida (ml, g en receta)
                      </SelectItem>
                      <SelectItem value="BOTTLE" className="rounded-lg py-2">
                        Botella entera
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                      Receta
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={addCpLine}
                      className="h-12 rounded-2xl px-4 text-sm font-semibold"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                        <Plus className="h-4 w-4" />
                      </span>
                      Línea
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {cpLines.map((line, index) => (
                      <RecipeIngredientRow
                        key={`${line.inventoryItemId}-${index}`}
                        line={line}
                        index={index}
                        materials={insumos as ApiInventoryItem[]}
                        saleType={cpSaleType}
                        selectTriggerClass={selectTriggerClass}
                        quantityInputClass="h-10 w-28 rounded-xl border-zinc-200/50 bg-white text-center font-mono dark:border-zinc-800/50 dark:bg-[#1C1C1E]"
                        onChange={(i, patch) =>
                          setCpLines((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
                          )
                        }
                        onRemove={(i) =>
                          setCpLines((prev) => prev.filter((_, j) => j !== i))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
                <DialogFooter className="flex-col gap-3 sm:flex-col">
                  <Button
                    type="submit"
                    disabled={cpSaving}
                    className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
                  >
                    {cpSaving ? "Guardando…" : "Crear y activar en el evento"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateProductOpen(false)}
                    className="h-11 w-full rounded-xl border-zinc-200/50 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
                  >
                    Cancelar
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[min(92vh,900px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-lg dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
            <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
              <div className="flex gap-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                  <Pencil className="h-6 w-6 text-[#FF9500]" />
                </span>
                <DialogHeader className="flex-1 text-left">
                  <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                    Editar producto y receta
                  </DialogTitle>
                </DialogHeader>
              </div>
            </div>
            <div className="flex max-h-[calc(92vh-10rem)] flex-col overflow-y-auto">
              <div className="space-y-6 p-8 pt-6">
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Nombre
                  </label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Precio
                  </label>
                  <Input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className={cn(inputClass, "font-mono")}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Tipo de venta (stock)
                  </label>
                  <Select
                    value={editSaleType}
                    onValueChange={(v) => setEditSaleType(v as ProductSaleType)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                      <SelectItem value="GLASS" className="rounded-lg py-2">
                        Vaso / medida (ml, g en receta)
                      </SelectItem>
                      <SelectItem value="BOTTLE" className="rounded-lg py-2">
                        Botella entera
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                      Receta
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={addEditLine}
                      className="h-12 rounded-2xl px-4 text-sm font-semibold"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                        <Plus className="h-4 w-4" />
                      </span>
                      Línea
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {editLines.map((line, index) => (
                      <RecipeIngredientRow
                        key={`${line.inventoryItemId}-${index}`}
                        line={line}
                        index={index}
                        materials={insumos as ApiInventoryItem[]}
                        saleType={editSaleType}
                        selectTriggerClass={selectTriggerClass}
                        quantityInputClass="h-10 w-28 rounded-xl border-zinc-200/50 bg-white text-center font-mono dark:border-zinc-800/50 dark:bg-[#1C1C1E]"
                        onChange={(i, patch) =>
                          setEditLines((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
                          )
                        }
                        onRemove={(i) =>
                          setEditLines((prev) => prev.filter((_, j) => j !== i))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
                <DialogFooter className="flex-col gap-3 sm:flex-col">
                  <Button
                    type="button"
                    disabled={editSaving || !editName.trim()}
                    onClick={() => void saveEdit()}
                    className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
                  >
                    {editSaving ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    className="h-11 w-full rounded-xl border-zinc-200/50 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
