import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { Check, Package, Pencil, Plus, Search, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { ApiProduct } from "@/components/inventory/recipe-config";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
import type {
  BarInventoryItemRow,
  BarMenuProductRow,
} from "@/types/event-dashboard";
import { BarMaterialForm } from "./bar-material-form";
import {
  decimalInput,
  normalizeSearch,
  packageDescription,
  packageFactor,
  quantityLabel,
  stockInPackages,
  stockUnit,
  validQuantity,
} from "./bar-workspace-model";

type Props = {
  token: string | null;
  barId: string;
  products: ApiProduct[];
  menu: BarMenuProductRow[];
  inventory: BarInventoryItemRow[];
  materials: ApiInventoryItem[];
  onSaved: () => Promise<void>;
  onMaterialCreated: (item: ApiInventoryItem) => void;
  onShowProduct: (id: string) => void;
};

export function BarStockPanel({
  token,
  barId,
  products,
  menu,
  inventory,
  materials,
  onSaved,
  onMaterialCreated,
  onShowProduct,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "empty">("all");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<
    ApiInventoryItem | undefined
  >(undefined);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "count">("add");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [expected, setExpected] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const usedBy = useMemo(() => {
    const map = new Map<string, ApiProduct[]>();
    for (const product of products)
      for (const line of product.recipes)
        map.set(line.inventoryItemId, [
          ...(map.get(line.inventoryItemId) ?? []),
          product,
        ]);
    return map;
  }, [products]);
  type StockRow = BarInventoryItemRow & { productId?: string };
  const stockRows: StockRow[] = [
    ...inventory,
    ...products
      .filter((product) => product.recipes.length === 0)
      .flatMap((product) => {
        const stock = menu.find((row) => row.id === product.id)?.directStock;
        return stock == null
          ? []
          : [
              {
                productId: product.id,
                inventoryItemId: `product:${product.id}`,
                name: product.name,
                baseUnit: "UNIT" as const,
                packageSize: "1",
                barCurrentStock: stock,
                barInventoryRowId: product.id,
                eventStockAllocated: "0",
                unallocatedEventStock: "0",
              },
            ];
      }),
  ];
  stockRows.sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  const tracked = stockRows.filter(
    (item) =>
      usedBy.has(item.inventoryItemId) ||
      item.barInventoryRowId ||
      extraIds.includes(item.inventoryItemId),
  );
  const rows = tracked.filter(
    (item) =>
      normalizeSearch(
        `${item.name} ${(usedBy.get(item.inventoryItemId) ?? []).map((p) => p.name).join(" ")}`,
      ).includes(normalizeSearch(query)) &&
      (filter !== "empty" || new Decimal(item.barCurrentStock).lte(0)),
  );
  const emptyCount = tracked.filter((item) =>
    new Decimal(item.barCurrentStock).lte(0),
  ).length;

  function open(item: StockRow) {
    setEditing(item.inventoryItemId);
    setExpected(item.barCurrentStock);
    setQuantity("");
    setCost("");
    setMode("add");
    setError("");
  }
  async function save(item: StockRow) {
    if (!token || busy) return;
    setError("");
    if (
      !validQuantity(quantity) ||
      (mode === "add" && new Decimal(decimalInput(quantity)).lte(0))
    ) {
      setError(
        mode === "add"
          ? "Ingresá una cantidad mayor a cero."
          : "Ingresá el conteo actual, con hasta cuatro decimales.",
      );
      return;
    }
    if (item.productId && !/^\d+(\.\d{1,2})?$/.test(decimalInput(quantity))) {
      setError("Usá hasta dos decimales para los productos por unidad.");
      return;
    }
    if (
      mode === "add" &&
      cost.trim() &&
      !/^\d{1,8}(\.\d{1,2})?$/.test(decimalInput(cost))
    ) {
      setError("Revisá el costo: usá hasta dos decimales.");
      return;
    }
    // Absolute target + captured base snapshot makes resending safe after a lost response.
    const target =
      mode === "add"
        ? new Decimal(expected)
            .plus(
              new Decimal(decimalInput(quantity)).times(packageFactor(item)),
            )
            .toDecimalPlaces(2)
            .toString()
        : new Decimal(decimalInput(quantity))
            .times(packageFactor(item))
            .toDecimalPlaces(2)
            .toString();
    setBusy(true);
    try {
      await apiFetch(
        `/bars/${barId}/${item.productId ? "product-stock" : "stock"}`,
        {
          method: "PUT",
          token,
          body: JSON.stringify({
            ...(item.productId
              ? { productId: item.productId }
              : { inventoryItemId: item.inventoryItemId }),
            quantity: target,
            expectedCurrentStock: expected,
            stockInputAs: "BASE_UNITS",
            ...(mode === "add" && cost.trim()
              ? { totalCost: decimalInput(cost) }
              : {}),
          }),
        },
      );
      await onSaved();
      setEditing(null);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo guardar. Podés volver a intentarlo.",
      );
      if (e instanceof ApiError && e.status === 409) {
        await onSaved();
        // Keep the captured version. Reopening the editor explicitly accepts the new count.
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="bw-heading">
        <div>
          <h3>Stock de la barra</h3>
          <p>
            {tracked.length}{" "}
            {tracked.length === 1 ? "existencia" : "existencias"}
            {emptyCount > 0 ? ` · ${emptyCount} sin stock` : ""}
          </p>
        </div>
        <button
          className="bw-primary"
          onClick={() => setAdding(!adding)}
          disabled={busy}
        >
          <Plus size={17} />
          Agregar stock
        </button>
      </div>
      {adding && (
        <div className="bw-stock-add">
          <label htmlFor="stock-item-picker">Elegí qué entra a la barra</label>
          <div className="bw-form-actions">
            <select
              id="stock-item-picker"
              value=""
              onChange={(e) => {
                const item = stockRows.find(
                  (row) => row.inventoryItemId === e.target.value,
                );
                if (item) {
                  setExtraIds((prev) => [
                    ...new Set([...prev, item.inventoryItemId]),
                  ]);
                  setAdding(false);
                  setQuery("");
                  setFilter("all");
                  open(item);
                }
              }}
            >
              <option value="">Seleccionar producto o insumo…</option>
              {stockRows.map((item) => (
                <option key={item.inventoryItemId} value={item.inventoryItemId}>
                  {item.name} · {packageDescription(item)}
                </option>
              ))}
            </select>
            <button
              className="bw-secondary"
              onClick={() => {
                setEditingMaterial(undefined);
                setCreating(true);
                setAdding(false);
              }}
            >
              <Plus size={16} />
              Nuevo insumo
            </button>
            <button
              className="bw-icon-button"
              aria-label="Cerrar selector de stock"
              onClick={() => setAdding(false)}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}
      {creating && (
        <BarMaterialForm
          key={editingMaterial?.id ?? "new"}
          item={editingMaterial}
          token={token}
          materials={materials}
          onCancel={() => {
            setCreating(false);
            setEditingMaterial(undefined);
          }}
          onCreated={(item) => {
            onMaterialCreated(item);
            if (editingMaterial) {
              setCreating(false);
              setEditingMaterial(undefined);
              return;
            }
            setExtraIds((prev) => [...prev, item.id]);
            setEditing(item.id);
            setExpected("0");
            setQuantity("");
            setCost("");
            setMode("add");
            setError("");
            setCreating(false);
            setQuery("");
            setFilter("all");
          }}
        />
      )}
      {tracked.length > 0 && (
        <div className="bw-toolbar">
          <label className="bw-search">
            <Search size={17} />
            <input
              aria-label="Buscar producto o insumo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto o insumo"
            />
          </label>
          <div className="bw-segmented" aria-label="Filtrar stock">
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Todos
            </button>
            <button
              aria-pressed={filter === "empty"}
              onClick={() => setFilter("empty")}
            >
              Sin stock{emptyCount > 0 && <span>{emptyCount}</span>}
            </button>
          </div>
        </div>
      )}
      {tracked.length === 0 ? (
        <div className="bw-empty">
          <Package size={30} />
          <h4>Las existencias de esta barra, en un lugar</h4>
          <p>
            Agregá mercadería o definí qué insumos usan tus productos desde el
            menú.
          </p>
          <button className="bw-secondary" onClick={() => setAdding(true)}>
            Cargar el primer insumo
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bw-empty">
          <h4>No hay existencias con este filtro</h4>
          <button
            className="bw-secondary"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Ver todo el stock
          </button>
        </div>
      ) : (
        <div className="bw-stock-list">
          <div className="bw-stock-columns">
            <span>Producto o insumo</span>
            <span>En esta barra</span>
            <span />
          </div>
          {rows.map((item) => {
            const consumers = usedBy.get(item.inventoryItemId) ?? [];
            const empty = new Decimal(item.barCurrentStock).lte(0);
            const edit = editing === item.inventoryItemId;
            const next = validQuantity(quantity)
              ? mode === "add"
                ? new Decimal(expected)
                    .div(packageFactor(item))
                    .plus(decimalInput(quantity))
                    .toString()
                : decimalInput(quantity)
              : null;
            return (
              <div key={item.inventoryItemId} className="bw-stock-item">
                <div className="bw-stock-row">
                  <div className="bw-stock-info">
                    <div className="bw-stock-name">
                      <h4>{item.name}</h4>
                      <button
                        className="bw-icon-button"
                        aria-label={
                          item.productId
                            ? `Ver producto ${item.name}`
                            : `Editar insumo ${item.name}`
                        }
                        disabled={busy || !!editing}
                        onClick={() => {
                          if (item.productId) {
                            onShowProduct(item.productId);
                            return;
                          }
                          setEditingMaterial(
                            materials.find(
                              (material) =>
                                material.id === item.inventoryItemId,
                            ),
                          );
                          setCreating(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                    <p>
                      {item.productId
                        ? "Producto por unidad"
                        : packageDescription(item)}
                    </p>
                    <div className="bw-consumers">
                      {item.productId ? (
                        <button onClick={() => onShowProduct(item.productId!)}>
                          Ver en el menú
                        </button>
                      ) : consumers.length ? (
                        consumers.map((product) => (
                          <button
                            key={product.id}
                            onClick={() => onShowProduct(product.id)}
                          >
                            {product.name}
                          </button>
                        ))
                      ) : (
                        <span>Sin productos en este menú</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={
                      empty ? "bw-stock-number empty" : "bw-stock-number"
                    }
                  >
                    <strong>{quantityLabel(stockInPackages(item))}</strong>
                    <small>{stockUnit(item)}</small>
                  </div>
                  <button
                    className="bw-secondary"
                    disabled={busy || (!!editing && !edit)}
                    onClick={() => (edit ? setEditing(null) : open(item))}
                  >
                    {edit ? "Cerrar" : "Actualizar"}
                  </button>
                </div>
                {edit && (
                  <div className="bw-stock-editor">
                    <div className="bw-segmented">
                      <button
                        disabled={busy}
                        aria-pressed={mode === "add"}
                        onClick={() => {
                          setMode("add");
                          setQuantity("");
                          setError("");
                        }}
                      >
                        Ingresar mercadería
                      </button>
                      <button
                        disabled={busy}
                        aria-pressed={mode === "count"}
                        onClick={() => {
                          setMode("count");
                          setQuantity("");
                          setError("");
                        }}
                      >
                        Corregir conteo
                      </button>
                    </div>
                    <div className="bw-fields">
                      <label htmlFor={`quantity-${item.inventoryItemId}`}>
                        {mode === "add"
                          ? "Cantidad que entra"
                          : "Cantidad real en la barra"}{" "}
                        ({stockUnit(item)})
                        <input
                          autoFocus
                          id={`quantity-${item.inventoryItemId}`}
                          inputMode="decimal"
                          value={quantity}
                          disabled={busy}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder="0"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void save(item);
                          }}
                        />
                      </label>
                      {mode === "add" && (
                        <label htmlFor={`cost-${item.inventoryItemId}`}>
                          Costo total de compra (opcional)
                          <span className="bw-price-input">
                            <span>$</span>
                            <input
                              id={`cost-${item.inventoryItemId}`}
                              inputMode="decimal"
                              value={cost}
                              disabled={busy}
                              onChange={(e) => setCost(e.target.value)}
                              placeholder="0"
                            />
                          </span>
                        </label>
                      )}
                    </div>
                    <div className="bw-stock-equation">
                      <span>
                        Actual{" "}
                        <strong>
                          {quantityLabel(
                            new Decimal(expected)
                              .div(packageFactor(item))
                              .toString(),
                          )}
                        </strong>
                      </span>
                      <span>{mode === "add" ? "+" : "se corrige a"}</span>
                      {mode === "add" && (
                        <>
                          <span>
                            Entran{" "}
                            <strong>
                              {validQuantity(quantity)
                                ? quantityLabel(decimalInput(quantity))
                                : "—"}
                            </strong>
                          </span>
                          <span>=</span>
                        </>
                      )}
                      <span>
                        Quedan{" "}
                        <strong>
                          {next == null ? "—" : quantityLabel(next)}{" "}
                          {stockUnit(item)}
                        </strong>
                      </span>
                    </div>
                    {error && (
                      <p role="alert" className="bw-error">
                        {error}
                        {error.includes("cambió") && (
                          <button
                            className="bw-secondary"
                            onClick={() => open(item)}
                          >
                            Revisar stock actual
                          </button>
                        )}
                      </p>
                    )}
                    <div className="bw-form-actions">
                      <button
                        className="bw-primary"
                        disabled={busy || !quantity.trim()}
                        onClick={() => void save(item)}
                      >
                        <Check size={16} />
                        {busy
                          ? "Guardando…"
                          : mode === "add"
                            ? "Registrar ingreso"
                            : "Guardar conteo"}
                      </button>
                      <button
                        className="bw-secondary"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
