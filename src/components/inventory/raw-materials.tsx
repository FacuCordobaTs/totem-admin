import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Search, Plus, PackagePlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"

export type InventoryUnit = "ML" | "UNIDAD" | "GRAMOS"

export interface ApiInventoryItem {
  id: string
  name: string
  unit: InventoryUnit
  currentStock: string
  isLowStock: boolean
}

function unitLabel(unit: InventoryUnit): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMOS":
      return "g"
    default:
      return "uds."
  }
}

function stockStatus(current: number, alertThreshold: number, isLow: boolean) {
  if (current <= alertThreshold * 0.5) return "critical"
  if (isLow || current <= alertThreshold) return "low"
  return "ok"
}

function getStockColor(status: string) {
  switch (status) {
    case "critical":
      return "text-destructive"
    case "low":
      return "text-amber-500"
    default:
      return "text-primary"
  }
}

interface RawMaterialsProps {
  items: ApiInventoryItem[]
  alertThreshold: string
  loading: boolean
  token: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onChanged: () => void
}

export function RawMaterials({
  items,
  alertThreshold,
  loading,
  token,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  onChanged,
}: RawMaterialsProps) {
  const th = Number.parseFloat(alertThreshold) || 100
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [addUnit, setAddUnit] = useState<InventoryUnit>("ML")
  const [addStock, setAddStock] = useState("0")
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<ApiInventoryItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState("")
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const filteredMaterials = items.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function openAdjust(m: ApiInventoryItem) {
    setAdjustTarget(m)
    setAdjustDelta("")
    setAdjustError(null)
    setAdjustOpen(true)
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setAddError(null)
    setAddSaving(true)
    try {
      await apiFetch("/inventory/items", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: addName.trim(),
          unit: addUnit,
          currentStock: addStock,
        }),
      })
      setAddOpen(false)
      setAddName("")
      setAddUnit("ML")
      setAddStock("0")
      onChanged()
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "No se pudo crear")
    } finally {
      setAddSaving(false)
    }
  }

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !adjustTarget) return
    setAdjustError(null)
    setAdjustSaving(true)
    try {
      await apiFetch(`/inventory/items/${adjustTarget.id}/stock`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ delta: adjustDelta }),
      })
      setAdjustOpen(false)
      setAdjustTarget(null)
      onChanged()
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : "No se pudo ajustar")
    } finally {
      setAdjustSaving(false)
    }
  }

  return (
    <>
      <Card className="flex h-full flex-col border-border bg-card">
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-medium">Materias primas</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={!token}
              onClick={() => {
                setAddError(null)
                setAddOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Añadir
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Umbral de alerta: <span className="font-mono">{alertThreshold}</span>{" "}
            (por unidad de medida del ítem)
          </p>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar materiales..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-secondary pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando inventario…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-muted-foreground">Unidad</TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Stock
                  </TableHead>
                  <TableHead className="w-[100px] text-muted-foreground">
                    Ajuste
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map((material) => {
                  const cur = Number.parseFloat(material.currentStock)
                  const status = stockStatus(cur, th, material.isLowStock)
                  const isSelected = selectedId === material.id

                  return (
                    <TableRow
                      key={material.id}
                      onClick={() => onSelect(material.id)}
                      className={cn(
                        "cursor-pointer border-border transition-colors",
                        isSelected
                          ? "bg-primary/10 hover:bg-primary/10"
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {unitLabel(material.unit)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn("text-right font-mono", getStockColor(status))}
                      >
                        {material.currentStock}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-primary"
                          disabled={!token}
                          onClick={() => openAdjust(material)}
                        >
                          <PackagePlus className="h-4 w-4" />
                          Stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>OK</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Bajo (≤ umbral)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span>Crítico (≤ ½ umbral)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva materia prima</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAdd} className="flex flex-col gap-4">
            {addError ? (
              <p className="text-sm text-destructive" role="alert">
                {addError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Unidad</label>
              <Select
                value={addUnit}
                onValueChange={(v) => setAddUnit(v as InventoryUnit)}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ML">Mililitros (ml)</SelectItem>
                  <SelectItem value="UNIDAD">Unidades (uds.)</SelectItem>
                  <SelectItem value="GRAMOS">Gramos (g)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stock inicial</label>
              <Input
                type="text"
                inputMode="decimal"
                value={addStock}
                onChange={(e) => setAddStock(e.target.value)}
                className="bg-secondary font-mono"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={addSaving}>
                {addSaving ? "Guardando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste de stock — recepción</DialogTitle>
          </DialogHeader>
          {adjustTarget ? (
            <form onSubmit={submitAdjust} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{adjustTarget.name}</span>
                <br />
                Stock actual:{" "}
                <span className="font-mono">{adjustTarget.currentStock}</span>{" "}
                {unitLabel(adjustTarget.unit)}
              </p>
              {adjustError ? (
                <p className="text-sm text-destructive" role="alert">
                  {adjustError}
                </p>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-medium">Cantidad a ingresar (+)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  required
                  placeholder="Ej. 24 o 1500"
                  className="bg-secondary font-mono"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={adjustSaving}>
                  {adjustSaving ? "Aplicando…" : "Aplicar ingreso"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
