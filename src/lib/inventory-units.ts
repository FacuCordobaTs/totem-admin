import type { InventoryBaseUnit } from "@/components/inventory/raw-materials"

export function unitLabel(unit: InventoryBaseUnit): string {
  switch (unit) {
    case "ML":
      return "ml"
    case "GRAMS":
      return "g"
    default:
      return "uds."
  }
}

/** Insumo con envase físico (botella/bolsa) medido en ml o g */
export function hasBottlePackage(row: {
  baseUnit: InventoryBaseUnit
  packageSize: string
}): boolean {
  if (row.baseUnit !== "ML" && row.baseUnit !== "GRAMS") return false
  const p = Number.parseFloat(String(row.packageSize ?? "0"))
  return Number.isFinite(p) && p > 0
}

/** Texto bajo el input de stock por envases */
export function bottleStockPreviewLine(
  bottles: number,
  packageSize: string,
  baseUnit: InventoryBaseUnit
): string {
  if (!Number.isFinite(bottles) || bottles <= 0) {
    return "Ingresá cuántas botellas ingresan."
  }
  const per = Number.parseFloat(packageSize)
  if (!Number.isFinite(per) || per <= 0) return ""
  const total = bottles * per
  const u = baseUnit === "GRAMS" ? "g" : "ml"
  return `${bottles.toLocaleString("es-AR")} botellas = ${total.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${u} totales en stock`
}

export function stockBaseToBottleDraft(stockAllocated: string, packageSize: string): string {
  const s = Number.parseFloat(String(stockAllocated).replace(",", "."))
  const per = Number.parseFloat(String(packageSize).replace(",", "."))
  if (!Number.isFinite(s) || !Number.isFinite(per) || per <= 0) return String(stockAllocated)
  const q = s / per
  if (!Number.isFinite(q)) return String(stockAllocated)
  const rounded = Math.round(q * 10000) / 10000
  return String(rounded).replace(/\.?0+$/, "")
}
