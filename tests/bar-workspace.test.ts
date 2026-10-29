import { describe, expect, test } from "bun:test";
import type { ApiProduct, ProductSaleType } from "../src/types/inventory";
import type { BarInventoryItemRow } from "../src/types/event-dashboard";
import {
  isEmptyStock,
  productAvailability,
  productAvailabilityDetail,
  productSaleType,
  recipeDraftFromLines,
  recipeLinesForApi,
  stockLabel,
} from "../src/components/events/bar-workspace-model";

// Trago: 1 fernet rinde 10 ventas; 1 cola rinde 5. Botellas: 1 fernet y 2 colas por venta.
const product = (saleType: ProductSaleType = "GLASS"): ApiProduct => ({
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
      quantityUsed: saleType === "BOTTLE" ? "1.000000" : "0.100000",
      yieldPerPackage: saleType === "BOTTLE" ? null : "10.000",
    },
    {
      id: "r2",
      inventoryItemId: "cola",
      inventoryItemName: "Cola",
      quantityUsed: saleType === "BOTTLE" ? "2.000000" : "0.200000",
      yieldPerPackage: saleType === "BOTTLE" ? null : "5.000",
    },
  ],
});
const item = (id: string, stock: string): BarInventoryItemRow => ({
  inventoryItemId: id,
  name: id,
  barCurrentStock: stock,
  barInventoryRowId: id,
  eventStockAllocated: "999999",
  unallocatedEventStock: "999999",
});
describe("Disponibilidad física de una barra", () => {
  test("la limita el ingrediente que antes se termina, sin usar el stock de otro lugar", () => {
    expect(
      productAvailability(product(), [item("fernet", "2"), item("cola", "1")]),
    ).toBe(5);
  });
  test("un insumo faltante da cero aunque otro tenga mercadería", () => {
    expect(productAvailability(product(), [item("fernet", "10")])).toBe(0);
  });
  test("botellas descuenta unidades enteras por venta", () => {
    expect(
      productAvailability(product("BOTTLE"), [
        item("fernet", "3"),
        item("cola", "4"),
      ]),
    ).toBe(2);
  });
  test("las fracciones de un trago no pierden la última venta", () => {
    const third = {
      ...product(),
      recipes: [{ ...product().recipes[0], quantityUsed: "0.333333" }],
    };
    expect(productAvailability(third, [item("fernet", "1")])).toBe(3);
    expect(productAvailability(third, [item("fernet", "0.333334")])).toBe(1);
  });
  test("dos productos pueden compartir el mismo insumo sin duplicar sus existencias", () => {
    const stocks = [item("fernet", "1"), item("cola", "2")];
    expect(productAvailability(product(), stocks)).toBe(10);
    expect(productAvailability({ ...product(), id: "other" }, stocks)).toBe(10);
    expect(stocks[0].barCurrentStock).toBe("1");
  });
  test("cada modo decide su disponibilidad", () => {
    const bare = (saleType: ProductSaleType) => ({
      ...product(saleType),
      recipes: [],
    });
    expect(productAvailability(bare("NONE"), [], "5")).toBeNull();
    expect(productAvailability(bare("UNIT"), [])).toBe(0);
    expect(productAvailability(bare("UNIT"), [], "3.5")).toBe(3);
    // Trago o botellas sin receta: todavía sin configurar.
    expect(productAvailability(bare("GLASS"), [])).toBeNull();
    expect(productAvailability(bare("BOTTLE"), [])).toBeNull();
  });
  test("identifica el insumo que limita la venta", () => {
    const detail = productAvailabilityDetail(product(), [
      item("fernet", "2"),
      item("cola", "1"),
    ]);
    expect(detail.count).toBe(5);
    expect(detail.limiter?.inventoryItemName).toBe("Cola");
  });
  test("infiere el modo de productos sin dato", () => {
    const legacy = { ...product(), saleType: undefined };
    expect(productSaleType(legacy)).toBe("GLASS");
    expect(productSaleType({ ...legacy, recipes: [] }, "4")).toBe("UNIT");
    expect(productSaleType({ ...legacy, recipes: [] }, null)).toBe("NONE");
  });
});
describe("Receta en unidades", () => {
  test("el trago guarda cuántas ventas terminan cada insumo", () => {
    const draft = recipeDraftFromLines("GLASS", product().recipes);
    expect(draft.map((line) => line.value)).toEqual(["10", "5"]);
    expect(recipeLinesForApi("GLASS", draft)[0]).toEqual({
      inventoryItemId: "fernet",
      yieldPerPackage: "10",
    });
  });
  test("las botellas guardan unidades enteras", () => {
    const draft = recipeDraftFromLines("BOTTLE", product("BOTTLE").recipes);
    expect(draft.map((line) => line.value)).toEqual(["1", "2"]);
    expect(recipeLinesForApi("BOTTLE", draft)[1]).toEqual({
      inventoryItemId: "cola",
      quantityUsed: "2",
    });
  });
  test("el stock parcial se muestra en unidades y un remanente de redondeo es agotado", () => {
    expect(stockLabel("0.5")).toBe("0,5");
    expect(stockLabel("0.999996")).toBe("0,99");
    expect(isEmptyStock("0.000004")).toBe(true);
    expect(isEmptyStock("0.5")).toBe(false);
  });
});
