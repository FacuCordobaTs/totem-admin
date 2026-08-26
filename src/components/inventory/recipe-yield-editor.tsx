import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import { withTrailingBlank, type RecipeDraftLine } from "@/lib/inventory-recipe-helpers"
import { cn } from "@/lib/utils"

type Props = {
  lines: RecipeDraftLine[]
  materials: ApiInventoryItem[]
  /** Nombre del producto, para redactar el rinde ("cuántos … salen de un envase"). */
  productName: string
  onChange: (lines: RecipeDraftLine[]) => void
  inputClass?: string
}

/**
 * Editor de receta modelo 1.5 "rinde N por envase". En vez de pedir ml, cada fila pregunta
 * el nombre del insumo y cuántas porciones del producto rinde un envase de ese insumo.
 * Escribir en la última fila hace aparecer otra vacía debajo.
 */
export function RecipeYieldEditor({
  lines,
  materials,
  productName,
  onChange,
  inputClass,
}: Props) {
  const listId = useId()
  const servingLabel = productName.trim() ? `«${productName.trim()}»` : "porciones"

  // Trabajamos sobre `rows` (incluye la fila vacía sintética del final) para que escribir en
  // el fantasma la convierta en una fila real.
  const rows = withTrailingBlank(lines)

  function updateName(index: number, value: string) {
    const matched = materials.find(
      (m) => m.name.trim().toLowerCase() === value.trim().toLowerCase()
    )
    const next = rows.map((l, i) =>
      i === index ? { ...l, name: value, inventoryItemId: matched?.id ?? "" } : l
    )
    onChange(withTrailingBlank(next))
  }

  function updateYield(index: number, value: string) {
    onChange(rows.map((l, i) => (i === index ? { ...l, yieldPerPackage: value } : l)))
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index)
    onChange(withTrailingBlank(next))
  }

  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      {/* Encabezados */}
      <div className="flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wider text-white/25">
          Insumo
        </span>
        <span className="w-28 text-right text-[11px] font-medium uppercase tracking-wider text-white/25">
          Rinde por envase
        </span>
        <span className="w-5 shrink-0" />
      </div>

      {rows.map((line, index) => {
        const isGhost = index === rows.length - 1 && (line.name ?? "").trim() === ""
        const isNew = (line.name ?? "").trim() !== "" && !line.inventoryItemId
        return (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                value={line.name ?? ""}
                onChange={(e) => updateName(index, e.target.value)}
                list={listId}
                placeholder={isGhost ? "Escribí un insumo (ej. Fernet)" : "Nombre del insumo"}
                className={cn(
                  "h-10 min-w-0 flex-1 border-0 bg-white/[0.06] text-[14px] text-white placeholder:text-white/20 focus-visible:ring-0",
                  inputClass
                )}
              />
              <Input
                type="text"
                inputMode="decimal"
                value={line.yieldPerPackage ?? ""}
                onChange={(e) => updateYield(index, e.target.value)}
                placeholder="Ej. 20"
                disabled={isGhost}
                className={cn(
                  "h-10 w-28 border-0 bg-white/[0.06] text-center font-mono text-[14px] text-white placeholder:text-white/20 focus-visible:ring-0 disabled:opacity-40",
                  inputClass
                )}
              />
              {isGhost ? (
                <span className="w-5 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="w-5 shrink-0 p-1 text-white/20 transition-colors hover:text-red-400"
                  aria-label="Quitar insumo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isGhost ? (
              <p className="pl-1 text-[12px] leading-snug text-white/25">
                {isNew ? "Insumo nuevo — se creará. " : ""}
                Un envase de {(line.name ?? "").trim() || "este insumo"} rinde{" "}
                {(line.yieldPerPackage ?? "").trim() || "…"} {servingLabel}.
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
