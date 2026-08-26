import type { ApiInventoryItem } from "@/components/inventory/raw-materials"

export type ProductSaleType = "BOTTLE" | "GLASS"

export type RecipeDraftLine = {
  /** "" mientras el insumo todavía no existe (se crea por nombre al guardar). */
  inventoryItemId: string
  quantityUsed: string
  /** GLASS + líquido/sólido con envase: descontar un envase completo */
  useFullBottle?: boolean
  /** Nombre libre del insumo, para el editor por-nombre (modelo "rinde N por envase"). */
  name?: string
  /** Modelo 1.5: cuántas porciones/vasos rinde un envase del insumo (GLASS). */
  yieldPerPackage?: string
}

/**
 * Modelo 1.5 "rinde N por envase" — espejo de las mismas funciones del backend
 * (`inventory-deduction.ts`). Traducen entre el valor humano ("una botella rinde 20 vasos")
 * y el `quantityUsed` en unidades base (ml/g/UNIT) que usa el descuento de stock.
 */
export function baseUnitsPerServingFromYield(
  mat: ApiInventoryItem | undefined,
  yieldPerPackage: number
): number {
  if (!mat || !Number.isFinite(yieldPerPackage) || yieldPerPackage <= 0) return 0
  if (mat.baseUnit === "UNIT") return 1 / yieldPerPackage
  const pkg = Number.parseFloat(String(mat.packageSize ?? "0"))
  if (Number.isFinite(pkg) && pkg > 0) return pkg / yieldPerPackage
  return 1 / yieldPerPackage
}

export function yieldPerPackageFromQuantityUsed(
  mat: ApiInventoryItem | undefined,
  quantityUsed: number
): number {
  if (!mat || !Number.isFinite(quantityUsed) || quantityUsed <= 0) return 0
  if (mat.baseUnit === "UNIT") return 1 / quantityUsed
  const pkg = Number.parseFloat(String(mat.packageSize ?? "0"))
  if (Number.isFinite(pkg) && pkg > 0) return pkg / quantityUsed
  return 1 / quantityUsed
}

/** Redondeo prolijo para mostrar/guardar el rinde (sin decimales fantasma). */
function trimNumber(n: number): string {
  if (!Number.isFinite(n)) return ""
  const rounded = Math.round(n * 1000) / 1000
  return String(rounded)
}

/** Rinde a mostrar en el input, derivado de la línea (yield explícito o desde quantityUsed). */
export function draftLineYield(
  line: RecipeDraftLine,
  mat: ApiInventoryItem | undefined
): string {
  if (line.yieldPerPackage != null && line.yieldPerPackage !== "") {
    return line.yieldPerPackage
  }
  const q = Number.parseFloat(String(line.quantityUsed).replace(",", "."))
  const y = yieldPerPackageFromQuantityUsed(mat, q)
  return y > 0 ? trimNumber(y) : ""
}

/** Valor de `yieldPerPackage` a enviar a la API para una línea GLASS. */
export function draftLineYieldForApi(line: RecipeDraftLine): string {
  const y = Number.parseFloat(String(line.yieldPerPackage ?? "").replace(",", "."))
  return Number.isFinite(y) && y > 0 ? String(y) : "0"
}

export function blankRecipeLine(): RecipeDraftLine {
  return { inventoryItemId: "", quantityUsed: "", useFullBottle: false, name: "", yieldPerPackage: "" }
}

/** Garantiza una fila vacía al final para poder seguir agregando insumos. */
export function withTrailingBlank(lines: RecipeDraftLine[]): RecipeDraftLine[] {
  const last = lines[lines.length - 1]
  if (!last || (last.name ?? "").trim() !== "") return [...lines, blankRecipeLine()]
  return lines
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
  r: { inventoryItemId: string; quantityUsed: string; yieldPerPackage?: string | null },
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
  const yieldStr =
    r.yieldPerPackage != null && String(r.yieldPerPackage) !== ""
      ? String(r.yieldPerPackage)
      : trimNumber(yieldPerPackageFromQuantityUsed(mat, qty))
  return {
    inventoryItemId: r.inventoryItemId,
    quantityUsed: useFullBottle ? "1" : String(r.quantityUsed),
    useFullBottle,
    name: mat?.name ?? "",
    yieldPerPackage: yieldStr,
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
