import Decimal from "decimal.js";
import type {
  ApiInventoryItem,
  ApiProduct,
  ApiProductRecipeLine,
  ProductSaleType,
} from "@/types/inventory";
import type { BarInventoryItemRow } from "@/types/event-dashboard";

export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR");
export const quantityLabel = (value: string | number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(
    Number(value),
  );
/** Existencias en pantalla: unidades con hasta dos decimales (media botella = 0,5). */
export const stockLabel = (value: string | number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
    new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber(),
  );
export const moneyLabel = (value: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
export const decimalInput = (value: string) => value.trim().replace(",", ".");
export function priceInput(value: string): string {
  const amount = new Decimal(value);
  return amount.isInteger() ? amount.toFixed(0) : amount.toFixed(2);
}
export const validQuantity = (value: string) =>
  /^\d+(\.\d{1,4})?$/.test(decimalInput(value));
/** Un remanente de redondeo (millonésimas) cuenta como agotado. */
export const isEmptyStock = (value: string | number) =>
  new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_DOWN).lte(0);

export const SALE_TYPES: { value: ProductSaleType; label: string }[] = [
  { value: "GLASS", label: "Trago" },
  { value: "BOTTLE", label: "Botellas" },
  { value: "UNIT", label: "Unidad" },
  { value: "NONE", label: "Sin control" },
];
export const saleTypeLabel = (value: ProductSaleType) =>
  SALE_TYPES.find((type) => type.value === value)?.label ?? value;
export const usesRecipe = (
  value: ProductSaleType,
): value is "GLASS" | "BOTTLE" => value === "GLASS" || value === "BOTTLE";

/** Modo del producto; los datos previos a la migración se infieren de receta y conteo. */
export function productSaleType(
  product: Pick<ApiProduct, "saleType" | "recipes">,
  directStock?: string | null,
): ProductSaleType {
  if (product.saleType === "UNIT" || product.saleType === "NONE")
    return product.saleType;
  if (product.saleType && (product.recipes.length > 0 || directStock == null))
    return product.saleType;
  if (product.recipes.length > 0) return "GLASS";
  return directStock == null ? "NONE" : "UNIT";
}

/** Unidades del insumo que consume una venta del producto. */
export const consumptionPerSale = (line: ApiProductRecipeLine): Decimal =>
  new Decimal(line.quantityUsed || "0");

/** Trago: cuántas ventas terminan una unidad del insumo. */
export function yieldFromLine(line: ApiProductRecipeLine): string {
  if (line.yieldPerPackage) return new Decimal(line.yieldPerPackage).toString();
  const consumption = consumptionPerSale(line);
  return consumption.gt(0)
    ? new Decimal(1).div(consumption).toDecimalPlaces(2).toString()
    : "";
}

export type AvailabilityDetail = {
  /** Unidades vendibles. `null` = sin control o receta todavía sin configurar. */
  count: number | null;
  /** Insumo que limita la venta; `null` si no hay receta o no falta nada. */
  limiter: ApiProductRecipeLine | null;
};

/**
 * Disponibilidad según cómo se vende el producto. El operador necesita saber
 * por qué un trago no se puede vender sin abrir el stock.
 */
export function productAvailabilityDetail(
  product: ApiProduct,
  inventory: BarInventoryItemRow[],
  directStock?: string | null,
): AvailabilityDetail {
  const saleType = productSaleType(product, directStock);
  if (saleType === "NONE") return { count: null, limiter: null };
  if (saleType === "UNIT")
    return {
      count: Math.max(0, new Decimal(directStock ?? "0").floor().toNumber()),
      limiter: null,
    };
  if (product.recipes.length === 0) return { count: null, limiter: null };
  let count = Number.POSITIVE_INFINITY;
  let limiter: ApiProductRecipeLine | null = null;
  for (const line of product.recipes) {
    const consumption = consumptionPerSale(line);
    const available = consumption.lte(0)
      ? 0
      : new Decimal(
          inventory.find((item) => item.inventoryItemId === line.inventoryItemId)
            ?.barCurrentStock ?? "0",
        )
          .div(consumption)
          .floor()
          .toNumber();
    if (available < count) {
      count = available;
      limiter = line;
    }
  }
  return { count: Math.max(0, count), limiter };
}
export function productAvailability(
  product: ApiProduct,
  inventory: BarInventoryItemRow[],
  directStock?: string | null,
): number | null {
  return productAvailabilityDetail(product, inventory, directStock).count;
}
export function recipeSummary(product: ApiProduct): string {
  return product.recipes.map((line) => line.inventoryItemName).join(" + ");
}

/** Insumos del más reciente al más viejo; sin fecha, por nombre. */
export function byRecentCreation<T extends Pick<ApiInventoryItem, "name" | "createdAt">>(
  a: T,
  b: T,
): number {
  const at = a.createdAt ? Date.parse(a.createdAt) : 0;
  const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
  return bt - at || a.name.localeCompare(b.name, "es-AR");
}

/** Existencias que el Menú pide mostrar juntas: los insumos de un producto o su unidad. */
export type StockFocus = { label: string; ids: string[] };
/** Fila de stock de un producto que se vende por unidad. */
export const productStockId = (productId: string) => `product:${productId}`;

export type RecipeMode = "GLASS" | "BOTTLE";
/** Línea elegida en el diálogo; `value` es N (trago) o K botellas (botellas). */
export type RecipeDraftLine = {
  inventoryItemId: string;
  inventoryItemName: string;
  value: string;
};

/** Cuerpo de receta para la API según el modo. */
export function recipeLinesForApi(mode: RecipeMode, lines: RecipeDraftLine[]) {
  return lines.map((line) =>
    mode === "GLASS"
      ? {
          inventoryItemId: line.inventoryItemId,
          yieldPerPackage: decimalInput(line.value),
        }
      : {
          inventoryItemId: line.inventoryItemId,
          quantityUsed: decimalInput(line.value),
        },
  );
}

/** Líneas guardadas → borrador del diálogo. */
export function recipeDraftFromLines(
  mode: RecipeMode,
  lines: ApiProductRecipeLine[],
): RecipeDraftLine[] {
  return lines.map((line) => ({
    inventoryItemId: line.inventoryItemId,
    inventoryItemName: line.inventoryItemName,
    value:
      mode === "GLASS"
        ? yieldFromLine(line)
        : String(Math.max(1, consumptionPerSale(line).round().toNumber())),
  }));
}
