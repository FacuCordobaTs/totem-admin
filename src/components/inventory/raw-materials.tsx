import { useState } from "react"
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
import { Search, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"

export type InventoryUnit = "ML" | "UNIDAD" | "GRAMOS"

export interface ApiInventoryItem {
  id: string
  name: string
  unit: InventoryUnit
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

interface RawMaterialsProps {
  items: ApiInventoryItem[]
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
  loading,
  token,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  onChanged,
}: RawMaterialsProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [addUnit, setAddUnit] = useState<InventoryUnit>("ML")
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const filteredMaterials = items.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
        }),
      })
      setAddOpen(false)
      setAddName("")
      setAddUnit("ML")
      onChanged()
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "No se pudo crear")
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <>
      <section className="flex h-full flex-col gap-6 rounded-2xl bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Insumos</h2>
          <Button
            size="sm"
            disabled={!token}
            onClick={() => {
              setAddError(null)
              setAddOpen(true)
            }}
            className="h-10 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" />
          <Input
            placeholder="Buscar insumo"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] pl-10 text-[15px] dark:border-zinc-800/50 dark:bg-black"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl">
          {loading ? (
            <p className="px-2 py-6 text-[15px] text-[#8E8E93] dark:text-[#98989D]">Cargando…</p>
          ) : filteredMaterials.length === 0 ? (
            <p className="px-2 py-10 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
              No hay insumos para mostrar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                  <TableHead className="pl-2 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Nombre
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    Unidad
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map((material) => {
                  const isSelected = selectedId === material.id
                  return (
                    <TableRow
                      key={material.id}
                      onClick={() => onSelect(material.id)}
                      className={cn(
                        "cursor-pointer border-0 transition-colors hover:bg-[#F2F2F7]/70 dark:hover:bg-zinc-800/30",
                        isSelected && "bg-[#FF9500]/10 hover:bg-[#FF9500]/10"
                      )}
                    >
                      <TableCell className="pl-2 py-3.5 text-[15px] font-medium text-foreground">
                        {material.name}
                      </TableCell>
                      <TableCell className="py-3.5 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
                        {unitLabel(material.unit)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl border-zinc-200/50 bg-background sm:max-w-md dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Nuevo insumo
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAdd} className="flex flex-col gap-4">
            {addError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {addError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Nombre</label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Unidad</label>
              <Select
                value={addUnit}
                onValueChange={(v) => setAddUnit(v as InventoryUnit)}
              >
                <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ML">Mililitros (ml)</SelectItem>
                  <SelectItem value="UNIDAD">Unidades (uds.)</SelectItem>
                  <SelectItem value="GRAMOS">Gramos (g)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={addSaving} className="rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90">
                {addSaving ? "Guardando…" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
