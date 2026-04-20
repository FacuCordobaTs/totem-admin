import { Button } from "@/components/ui/button"
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
  materialSupportsFullBottle,
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
  const fullOk = materialSupportsFullBottle(mat, saleType)
  const hint = recipeConversionHint(
    saleType,
    mat,
    line.quantityUsed,
    line.useFullBottle
  )

  const measureLabel =
    mat?.baseUnit === "GRAMS" ? "Gramos a descontar" : "Mililitros a descontar"

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-zinc-200/50 bg-[#F2F2F7]/70 p-3 dark:border-zinc-800/50 dark:bg-black/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Select
          value={line.inventoryItemId}
          onValueChange={(v) =>
            onChange(index, { inventoryItemId: v, useFullBottle: false })
          }
        >
          <SelectTrigger
            className={cn(
              "min-w-[160px] flex-1 rounded-xl border-zinc-200/50 bg-background dark:border-zinc-800/50",
              selectTriggerClass
            )}
          >
            <SelectValue placeholder="Material" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {materials.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}{" "}
                <span className="text-[#8E8E93] dark:text-[#98989D]">
                  ({unitLabel(m.baseUnit)})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {fullOk ? (
          <div className="flex w-full min-w-[200px] flex-1 flex-col gap-2 sm:w-auto">
            <div className="flex gap-1 rounded-lg bg-background/80 p-0.5 dark:bg-black/40">
              <button
                type="button"
                onClick={() => onChange(index, { useFullBottle: false })}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  !line.useFullBottle
                    ? "bg-[#FF9500]/20 text-foreground"
                    : "text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
                )}
              >
                Medida
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(index, { useFullBottle: true, quantityUsed: "1" })
                }
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  line.useFullBottle
                    ? "bg-[#FF9500]/20 text-foreground"
                    : "text-[#8E8E93] hover:text-foreground dark:text-[#98989D]"
                )}
              >
                1 envase
              </button>
            </div>
            {line.useFullBottle ? (
              <p className="text-center text-sm font-medium tabular-nums text-foreground">
                1 {mat?.baseUnit === "GRAMS" ? "envase" : "botella"}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={line.quantityUsed}
                  onChange={(e) =>
                    onChange(index, { quantityUsed: e.target.value, useFullBottle: false })
                  }
                  className={cn(
                    "h-10 w-28 rounded-xl border-zinc-200/50 bg-background text-center font-mono dark:border-zinc-800/50",
                    quantityInputClass
                  )}
                />
                <span className="text-xs text-[#8E8E93] dark:text-[#98989D]">
                  {measureLabel}
                </span>
              </div>
            )}
          </div>
        ) : (
          <>
            <Input
              type="text"
              inputMode="decimal"
              value={line.quantityUsed}
              onChange={(e) => onChange(index, { quantityUsed: e.target.value })}
              className={cn(
                "h-10 w-24 rounded-xl border-zinc-200/50 bg-background text-center font-mono dark:border-zinc-800/50",
                quantityInputClass
              )}
            />
            <span className="text-sm text-[#8E8E93] dark:text-[#98989D]">
              {mat ? unitLabel(mat.baseUnit) : ""}
            </span>
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-[#8E8E93] hover:text-red-600 dark:text-[#98989D] dark:hover:text-red-400"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {hint ? (
        <p className="text-xs leading-snug text-[#8E8E93] dark:text-[#98989D]">{hint}</p>
      ) : null}
    </div>
  )
}
