import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2 } from "lucide-react"
import type { ApiInventoryItem } from "@/components/inventory/raw-materials"
import {
  recipeConversionHint,
  type ProductSaleType,
  type RecipeDraftLine,
} from "@/lib/inventory-recipe-helpers"
import { unitLabel } from "@/lib/inventory-units"
import { cn } from "@/lib/utils"

type Props = {
  line: RecipeDraftLine
  index: number
  materials: ApiInventoryItem[]
  saleType: ProductSaleType
  selectTriggerClass?: string
  quantityInputClass?: string
  onChange: (index: number, patch: Partial<RecipeDraftLine>) => void
  onRemove: (index: number) => void
}

export function RecipeIngredientRow({
  line,
  index,
  materials,
  saleType,
  selectTriggerClass,
  quantityInputClass,
  onChange,
  onRemove,
}: Props) {
  const mat = materials.find((m) => m.id === line.inventoryItemId)
  const pkg = Number.parseFloat(String(mat?.packageSize ?? "0"))
  const hasPackage = Number.isFinite(pkg) && pkg > 0

  // If a line was saved with useFullBottle, display the actual package size as qty
  const displayQty =
    line.useFullBottle && mat && hasPackage
      ? String(mat.packageSize).replace(/\.?0+$/, "")
      : line.quantityUsed

  // For BOTTLE with a defined package, the quantity means "number of bottles"
  const unitText =
    saleType === "BOTTLE" && mat && (mat.baseUnit === "ML" || mat.baseUnit === "GRAMS") && hasPackage
      ? "envases"
      : mat
        ? unitLabel(mat.baseUnit)
        : ""

  const hint = recipeConversionHint(saleType, mat, displayQty, false)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Select
          value={line.inventoryItemId}
          onValueChange={(v) => onChange(index, { inventoryItemId: v, useFullBottle: false })}
        >
          <SelectTrigger
            className={cn(
              "h-10 flex-1 border-0 bg-white/[0.06] text-[14px] text-white focus:ring-0",
              selectTriggerClass
            )}
          >
            <SelectValue placeholder="Insumo" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-white/[0.08] bg-[#0d0d0d] text-white">
            {materials.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-[14px]">
                {m.name}{" "}
                <span className="text-white/35">({unitLabel(m.baseUnit)})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="text"
          inputMode="decimal"
          value={displayQty}
          onChange={(e) => onChange(index, { quantityUsed: e.target.value, useFullBottle: false })}
          className={cn(
            "h-10 w-20 border-0 bg-white/[0.06] text-center font-mono text-[14px] text-white focus-visible:ring-0",
            quantityInputClass
          )}
        />

        <span className="w-14 shrink-0 text-[13px] text-white/35">{unitText}</span>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="shrink-0 p-1 text-white/20 transition-colors hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {hint ? (
        <p className="pl-1 text-[12px] leading-snug text-white/25">{hint}</p>
      ) : null}
    </div>
  )
}
