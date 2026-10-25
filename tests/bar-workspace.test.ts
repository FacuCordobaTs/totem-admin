import { describe, expect, test } from "bun:test";
import type { ApiProduct } from "../src/components/inventory/recipe-config";
import type { BarInventoryItemRow } from "../src/types/event-dashboard";
import {
  consumptionPerSale,
  productAvailability,
  stockInPackages,
  stockUnit,
} from "../src/components/events/bar-workspace-model";
const product = (saleType: "GLASS" | "BOTTLE" = "GLASS"): ApiProduct => ({
  id: "drink",
  name: "Fernet con cola",
  price: "5000",
  isActive: true,
  saleType,
  recipes: [
    {
      id: "r1",
      inventoryItemId: "fernet",
      inventoryItemName: "Fernet",
      quantityUsed: saleType === "BOTTLE" ? "1" : "75",
      inventoryBaseUnit: "ML",
      inventoryPackageSize: "750",
    },
    {
      id: "r2",
      inventoryItemId: "cola",
      inventoryItemName: "Cola",
      quantityUsed: saleType === "BOTTLE" ? "0.5" : "150",
      inventoryBaseUnit: "ML",
      inventoryPackageSize: "1500",
    },
  ],
});
const item = (
  id: string,
  stock: string,
  size = "750",
): BarInventoryItemRow => ({
  inventoryItemId: id,
  name: id,
  baseUnit: "ML",
  packageSize: size,
  barCurrentStock: stock,
  barInventoryRowId: id,
  eventStockAllocated: "999999",
  unallocatedEventStock: "999999",
});
describe("Disponibilidad física de una barra", () => {
  test("la limita el ingrediente que antes se termina, sin usar el stock de otro lugar", () => {
    expect(
      productAvailability(product(), [
        item("fernet", "1500"),
        item("cola", "1500", "1500"),
      ]),
    ).toBe(10);
  });
  test("un insumo faltante da cero aunque otro tenga mercadería", () => {
    expect(productAvailability(product(), [item("fernet", "7500")])).toBe(0);
  });
  test("un combo por botella descuenta envases completos y fraccionarios", () => {
    const p = product("BOTTLE");
    expect(consumptionPerSale(p, p.recipes[0]).toString()).toBe("750");
    expect(consumptionPerSale(p, p.recipes[1]).toString()).toBe("750");
    expect(
      productAvailability(p, [
        item("fernet", "1500"),
        item("cola", "1500", "1500"),
      ]),
    ).toBe(2);
  });
  test("dos productos pueden compartir el mismo insumo sin duplicar sus existencias", () => {
    const stocks = [item("fernet", "750"), item("cola", "1500", "1500")];
    expect(productAvailability(product(), stocks)).toBe(10);
    expect(productAvailability({ ...product(), id: "other" }, stocks)).toBe(10);
    expect(stocks[0].barCurrentStock).toBe("750");
  });
  test("sin receta es ilimitado, salvo un conteo explícito de la barra", () => {
    const p = { ...product(), recipes: [] };
    expect(productAvailability(p, [])).toBeNull();
    expect(productAvailability(p, [], "0")).toBe(0);
  });
  test("el stock parcial nunca se redondea a una botella entera", () => {
    expect(stockInPackages(item("fernet", "375"))).toBe("0.5");
    expect(stockInPackages(item("fernet", "0"))).toBe("0");
  });
  test("respeta latas y paquetes en lugar de llamar botella a todo", () => {
    expect(
      stockUnit({ baseUnit: "ML", packageSize: "350", countingUnit: "lata" }),
    ).toBe("latas");
    expect(stockUnit({ baseUnit: "GRAMS", packageSize: "1000" })).toBe(
      "paquetes",
    );
  });
});
