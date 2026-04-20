import type { ApiInventoryItem } from "@/components/inventory/raw-materials"

export type ProductSaleType = "BOTTLE" | "GLASS"

export type RecipeDraftLine = {
  inventoryItemId: string
  quantityUsed: string
  /** GLASS + líquido/sólido con envase: descontar un envase completo */
  useFullBottle?: boolean
}

export function materialSupportsFullBottle(
  mat: ApiInventoryItem | undefined,
  saleType: ProductSaleType
): boolean {
  if (saleType !== "GLASS" || !mat) return false
  if (mat.baseUnit !== "ML" && mat.baseUnit !== "GRAMS") return false
  const pkg = Number.parseFloat(String(mat.packageSize ?? "0"))
  return Number.isFinite(pkg) && pkg > 0
}

export function recipeApiLineToDraft(
  r: { inventoryItemId: string; quantityUsed: string },
  mat: ApiInventoryItem | undefined
): RecipeDraftLine {
  const qty = Number.parseFloat(String(r.quantityUsed).replace(",", "."))
  const pkg = mat ? Number.parseFloat(String(mat.packageSize ?? "0")) : 0
  const useFullBottle =
    mat != null &&
    (mat.baseUnit === "ML" || mat.baseUnit === "GRAMS") &&
    Number.isFinite(pkg) &&
    pkg > 0 &&
    Number.isFinite(qty) &&
    Math.abs(qty - pkg) < 1e-4
  return {
    inventoryItemId: r.inventoryItemId,
    quantityUsed: useFullBottle ? "1" : String(r.quantityUsed),
    useFullBottle,
  }
}

export function draftLineQuantityForApi(
  line: RecipeDraftLine,
  mat: ApiInventoryItem | undefined
): string {
  if (
    line.useFullBottle &&
    mat &&
    (mat.baseUnit === "ML" || mat.baseUnit === "GRAMS") &&
    Number.parseFloat(String(mat.packageSize ?? "0")) > 0
  ) {
    return String(mat.packageSize).replace(",", ".")
  }
  return line.quantityUsed.replace(",", ".")
}

export function recipeConversionHint(
  saleType: ProductSaleType,
  material: ApiInventoryItem | undefined,
  quantityUsed: string,
  useFullBottle?: boolean
): string | null {
  if (!material) return null
  const pkg = Number.parseFloat(String(material.packageSize ?? "0"))

  if (saleType === "GLASS" && useFullBottle && pkg > 0) {
    const u = material.baseUnit === "GRAMS" ? "g" : "ml"
    return `(Descuenta ${pkg.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${u} del stock)`
  }

  const q = Number.parseFloat(quantityUsed.replace(",", "."))
  if (!Number.isFinite(q) || q <= 0) return null

  if (saleType === "GLASS" && material.baseUnit === "ML" && pkg > 0) {
    const drinks = Math.floor(pkg / q)
    return `≈ ${drinks} tragos de ${q} ml por envase (${pkg} ml).`
  }
  if (saleType === "GLASS" && material.baseUnit === "GRAMS" && pkg > 0) {
    const portions = Math.floor(pkg / q)
    return `≈ ${portions} porciones de ${q} g por envase (${pkg} g).`
  }
  if (material.baseUnit === "UNIT" && saleType === "BOTTLE") {
    return `Cada venta descuenta ${q} unidad(es) de stock.`
  }
  if (
    saleType === "BOTTLE" &&
    (material.baseUnit === "ML" || material.baseUnit === "GRAMS") &&
    pkg > 0
  ) {
    const total = q * pkg
    const u = material.baseUnit === "GRAMS" ? "g" : "ml"
    return `Cada venta descuenta ${q} envase(s) × ${pkg} = ${total.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${u}.`
  }
  return null
}
