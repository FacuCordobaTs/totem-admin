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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import { unitLabel } from "@/lib/inventory-units"

export type InventoryBaseUnit = "ML" | "GRAMS" | "UNIT"

export interface ApiInventoryItem {
  id: string
  name: string
  baseUnit: InventoryBaseUnit
  packageSize: string
}

type MaterialKind = "liquid" | "solid" | "unit"

function kindToBaseUnit(k: MaterialKind): InventoryBaseUnit {
  switch (k) {
    case "liquid":
      return "ML"
    case "solid":
      return "GRAMS"
    default:
      return "UNIT"
  }
}

function baseUnitToKind(u: InventoryBaseUnit): MaterialKind {
  switch (u) {
    case "ML":
      return "liquid"
    case "GRAMS":
      return "solid"
    default:
      return "unit"
  }
}

function packageLabel(kind: MaterialKind): string {
  switch (kind) {
    case "liquid":
      return "Tamaño de la botella/envase (ml)"
    case "solid":
      return "Peso del envase (g)"
    default:
      return "Unidades por paquete (opcional)"
  }
}

interface RawMaterialsProps {
  items: ApiInventoryItem[]
  loading: boolean
  token: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
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
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formKind, setFormKind] = useState<MaterialKind>("liquid")
  const [formPackageSize, setFormPackageSize] = useState("")
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<ApiInventoryItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const filteredMaterials = items.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function openCreate() {
    setFormError(null)
    setEditingId(null)
    setFormName("")
    setFormKind("liquid")
    setFormPackageSize("")
    setFormOpen(true)
  }

  function openEdit(m: ApiInventoryItem, e: React.MouseEvent) {
    e.stopPropagation()
    setFormError(null)
    setEditingId(m.id)
    setFormName(m.name)
    setFormKind(baseUnitToKind(m.baseUnit))
    const pkg = Number.parseFloat(String(m.packageSize ?? "0"))
    setFormPackageSize(
      Number.isFinite(pkg) && pkg > 0 ? String(m.packageSize).replace(/\.?0+$/, "") : ""
    )
    setFormOpen(true)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setFormError(null)
    setFormSaving(true)
    try {
      const baseUnit = kindToBaseUnit(formKind)
      const rawPkg = formPackageSize.trim().replace(",", ".")
      const body: Record<string, unknown> = {
        name: formName.trim(),
        baseUnit,
      }
      if (editingId) {
        body.id = editingId
      }
      if (rawPkg !== "") {
        body.packageSize = rawPkg
      }
      await apiFetch("/inventory/items", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
      setFormOpen(false)
      setEditingId(null)
      onChanged()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setFormSaving(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    const id = deleteTarget.id
    setDeleteBusy(true)
    try {
      await apiFetch(`/inventory/items/${id}`, {
        method: "DELETE",
        token,
      })
      setDeleteTarget(null)
      if (selectedId === id) {
        onSelect(items.find((i) => i.id !== id)?.id ?? null)
      }
      onChanged()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo eliminar")
    } finally {
      setDeleteBusy(false)
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
            onClick={openCreate}
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

        {formError && !formOpen ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {formError}
          </p>
        ) : null}

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
                    Unidad base
                  </TableHead>
                  <TableHead className="w-[100px] text-right text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                    {/* acciones */}
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
                        {unitLabel(material.baseUnit)}
                        {Number.parseFloat(material.packageSize) > 0 ? (
                          <span className="ml-1 font-mono text-xs text-[#8E8E93]/80 dark:text-[#98989D]/80">
                            · envase {material.packageSize}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            disabled={!token}
                            onClick={(e) => openEdit(material, e)}
                            className="rounded-lg p-2 text-[#8E8E93] opacity-70 transition-opacity hover:bg-zinc-500/10 hover:opacity-100 dark:text-[#98989D]"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!token}
                            onClick={(e) => {
                              e.stopPropagation()
                              setFormError(null)
                              setDeleteTarget(material)
                            }}
                            className="rounded-lg p-2 text-[#8E8E93] opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-600 hover:opacity-100 dark:text-[#98989D] dark:hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) {
            setEditingId(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="rounded-2xl border-zinc-200/50 bg-background sm:max-w-md dark:border-zinc-800/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {editingId ? "Editar insumo" : "Nuevo insumo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitForm} className="flex flex-col gap-4">
            {formError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Nombre</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black"
                placeholder="Ej. Fernet Branca"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">Tipo</label>
              <Select
                value={formKind}
                onValueChange={(v) => setFormKind(v as MaterialKind)}
              >
                <SelectTrigger className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] dark:border-zinc-800/50 dark:bg-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="liquid">Líquido (ml)</SelectItem>
                  <SelectItem value="solid">Sólido (g)</SelectItem>
                  <SelectItem value="unit">Unidad indivisible (uds.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                {packageLabel(formKind)}{" "}
                <span className="font-normal normal-case text-[#8E8E93]/80 dark:text-[#98989D]/80">
                  (opcional)
                </span>
              </label>
              <Input
                value={formPackageSize}
                onChange={(e) => setFormPackageSize(e.target.value)}
                className="h-11 rounded-xl border-zinc-200/50 bg-[#F2F2F7] font-mono dark:border-zinc-800/50 dark:bg-black"
                inputMode="decimal"
                placeholder={formKind === "unit" ? "Ej. 6" : "Ej. 750"}
              />
              <p className="text-xs text-[#8E8E93] dark:text-[#98989D]">
                {formKind === "unit"
                  ? "Para ítems por unidad, podés dejar vacío o indicar cuántas unidades trae un paquete."
                  : "Definí el tamaño del envase para cargar stock por botellas y recetas en envases completos."}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formSaving}
                className="rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
              >
                {formSaving ? "Guardando…" : editingId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent className="border-zinc-200/50 dark:border-zinc-800/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar insumo</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `¿Desactivar «${deleteTarget.name}»? Dejará de mostrarse en el inventario. Solo podés hacerlo si ningún producto activo lo usa en la receta.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              {deleteBusy ? "…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
