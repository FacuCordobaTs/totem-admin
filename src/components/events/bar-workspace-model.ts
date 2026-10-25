import Decimal from "decimal.js";
import type {
  ApiProduct,
  ApiProductRecipeLine,
} from "@/components/inventory/recipe-config";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
import type { BarInventoryItemRow } from "@/types/event-dashboard";

export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
export const quantityLabel = (value: string | number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(
    Number(value),
  );
export const moneyLabel = (value: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
export const decimalInput = (value: string) => value.trim().replace(",", ".");
export const validQuantity = (value: string) =>
  /^\d+(\.\d{1,4})?$/.test(decimalInput(value));
export type StockUnit = Pick<ApiInventoryItem, "baseUnit" | "packageSize"> & {
  countingUnit?: string;
};
export function packageFactor(item: StockUnit): Decimal {
  return item.baseUnit !== "UNIT" && new Decimal(item.packageSize || "0").gt(0)
    ? new Decimal(item.packageSize)
    : new Decimal(1);
}
export function stockUnit(item: StockUnit): string {
  const generic =
    !item.countingUnit ||
    ["unidad", "unidades", "envase", "envases"].includes(item.countingUnit);
  if (generic && item.baseUnit === "ML") return "botellas";
  if (generic && item.baseUnit === "GRAMS") return "paquetes";
  const known: Record<string, string> = {
    unidad: "unidades",
    envase: "envases",
    botella: "botellas",
    paquete: "paquetes",
    lata: "latas",
    bolsa: "bolsas",
  };
  return (
    known[item.countingUnit ?? "unidad"] ?? item.countingUnit ?? "unidades"
  );
}
export function packageDescription(item: StockUnit): string {
  if (item.baseUnit === "UNIT") return stockUnit(item);
  return `${stockUnit(item)} de ${quantityLabel(item.packageSize)} ${item.baseUnit === "ML" ? "ml" : "g"}`;
}
export function stockInPackages(item: BarInventoryItemRow): string {
  return new Decimal(item.barCurrentStock)
    .div(packageFactor(item))
    .toDecimalPlaces(4)
    .toString();
}
export function consumptionPerSale(
  product: ApiProduct,
  line: ApiProductRecipeLine,
): Decimal {
  const amount = new Decimal(line.quantityUsed);
  return product.saleType === "BOTTLE"
    ? amount.times(
        packageFactor({
          baseUnit: line.inventoryBaseUnit,
          packageSize: line.inventoryPackageSize,
        }),
      )
    : amount;
}
export function productAvailability(
  product: ApiProduct,
  inventory: BarInventoryItemRow[],
  directStock?: string | null,
): number | null {
  if (product.recipes.length === 0)
    return directStock == null
      ? null
      : Math.max(0, new Decimal(directStock).floor().toNumber());
  const limits = product.recipes.map((line) => {
    const consumption = consumptionPerSale(product, line);
    if (consumption.lte(0)) return 0;
    return new Decimal(
      inventory.find((item) => item.inventoryItemId === line.inventoryItemId)
        ?.barCurrentStock ?? "0",
    )
      .div(consumption)
      .floor()
      .toNumber();
  });
  return Math.max(0, Math.min(...limits));
}
export function recipeSummary(product: ApiProduct): string {
  return product.recipes.map((line) => line.inventoryItemName).join(" + ");
}

export function singularStockUnit(item: StockUnit): string {
  const units: Record<string, string> = {
    unidades: "unidad",
    envases: "envase",
    botellas: "botella",
    paquetes: "paquete",
    latas: "lata",
    bolsas: "bolsa",
  };
  return units[stockUnit(item)] ?? "envase";
}
