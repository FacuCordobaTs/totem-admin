import { Fragment, useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import {
  ArrowLeft,
  Check,
  Package,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  packageQuantityLabel,
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
type StockRow = BarInventoryItemRow & { productId?: string };
type PickerView =
  | { view: "search" }
  | { view: "create" }
  | { view: "edit"; item: ApiInventoryItem };

const baseUnitLabel = (row: StockRow) =>
  row.baseUnit === "ML" ? "ml" : row.baseUnit === "GRAMS" ? "g" : "unidades";

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
  const [picker, setPicker] = useState<PickerView | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
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
  const stockRows: StockRow[] = [
    ...inventory,
    ...materials
      .filter(
        (material) =>
          !inventory.some((row) => row.inventoryItemId === material.id),
      )
      .map((material) => ({
        inventoryItemId: material.id,
        name: material.name,
        baseUnit: material.baseUnit,
        packageSize: material.packageSize,
        countingUnit: material.countingUnit,
        barCurrentStock: "0",
        barInventoryRowId: null,
        eventStockAllocated: "0",
        unallocatedEventStock: "0",
      })),
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
  useEffect(() => {
    if (!editing) return;
    document
      .getElementById(`stock-row-${editing}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [editing]);
  const pickerRows = stockRows.filter((item) =>
    normalizeSearch(
      `${item.name} ${(usedBy.get(item.inventoryItemId) ?? []).map((p) => p.name).join(" ")}`,
    ).includes(normalizeSearch(pickerQuery)),
  );

  function closePicker() {
    setPicker(null);
    setPickerQuery("");
  }
  function openPicker() {
    setEditing(null);
    setPicker({ view: "search" });
    setPickerQuery("");
  }
  function open(item: StockRow) {
    setEditing(item.inventoryItemId);
    setExpected(item.barCurrentStock);
    setQuantity("");
    setCost("");
    setMode("add");
    setError("");
  }
  function track(item: StockRow) {
    setExtraIds((prev) => [...new Set([...prev, item.inventoryItemId])]);
    closePicker();
    setQuery("");
    setFilter("all");
    open(item);
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
    <section aria-label="Stock de la barra">
      <div className="bw-tab-head">
        <p className="bw-lede">
          {tracked.length}{" "}
          {tracked.length === 1 ? "existencia" : "existencias"}
          {emptyCount > 0 && (
            <span className="bw-lede-warning">
              {" "}
              · {emptyCount} {emptyCount === 1 ? "agotada" : "agotadas"}
            </span>
          )}
        </p>
        <button
          className={editing ? "bw-secondary" : "bw-primary"}
          onClick={openPicker}
          disabled={busy}
        >
          <Plus size={17} />
          Agregar stock
        </button>
      </div>
      {picker && (
        <section
          className="bw-inline-panel"
          aria-label="Agregar existencias"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              closePicker();
            }
          }}
        >
          <div className="bw-inline-panel-head">
            <div>
              {picker.view === "search" && (
                <>
                  <h4>Agregar existencia</h4>
                  <p>
                    Elegí un producto o insumo para cargar su stock en esta
                    barra.
                  </p>
                </>
              )}
              {picker.view === "create" && (
                <>
                  <h4>Nuevo insumo</h4>
                  <p>
                    Se agrega a tu inventario y queda listo para cargar en esta
                    barra.
                  </p>
                </>
              )}
              {picker.view === "edit" && (
                <>
                  <h4>Editar insumo</h4>
                  <p>
                    El nombre y el envase se comparten en todo tu inventario.
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              className="bw-icon-button"
              aria-label="Cerrar"
              onClick={closePicker}
            >
              <X size={17} />
            </button>
          </div>
          {picker.view === "search" ? (
            <>
              <label className="bw-search">
                <Search size={17} />
                <input
                  autoFocus
                  aria-label="Buscar producto o insumo"
                  placeholder="Buscar producto o insumo"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                />
              </label>
              <div className="overflow-hidden rounded-xl bg-white/[0.02]">
                {pickerRows.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                        <TableHead className="pl-3 text-[11px] font-normal lowercase text-white/45">
                          Producto
                        </TableHead>
                        <TableHead className="w-[120px] pr-3">
                          <span className="sr-only">Acción</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                      {pickerRows.map((item) => {
                        const alreadyTracked = tracked.some(
                          (row) => row.inventoryItemId === item.inventoryItemId,
                        );
                        return (
                          <TableRow
                            key={item.inventoryItemId}
                            className="border-0 hover:bg-white/[0.03]"
                          >
                            <TableCell className="max-w-[420px] py-3 pl-3">
                              <div className="flex min-w-0 items-baseline gap-2">
                                <span className="truncate text-[14px] font-medium text-foreground">
                                  {item.name}
                                </span>
                                <span className="truncate text-[12px] text-white/40">
                                  {item.productId
                                    ? "Producto por unidad"
                                    : packageDescription(item)}
                                  {alreadyTracked ? " · Ya en la barra" : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 pr-3 text-right">
                              <button
                                className="bw-secondary bw-table-action"
                                disabled={busy}
                                aria-label={
                                  alreadyTracked
                                    ? `Cargar stock de ${item.name}`
                                    : `Agregar ${item.name} al stock de la barra`
                                }
                                onClick={() => track(item)}
                              >
                                {alreadyTracked ? "Cargar" : "Agregar"}
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="px-4 py-6 text-[13px] text-white/45">
                    No hay productos ni insumos con ese nombre.
                  </p>
                )}
              </div>
              <div className="bw-form-actions">
                <button
                  type="button"
                  className="bw-secondary"
                  onClick={() => setPicker({ view: "create" })}
                >
                  <Plus size={16} />
                  Nuevo insumo
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="bw-back"
                onClick={() => setPicker({ view: "search" })}
              >
                <ArrowLeft size={15} />
                {picker.view === "edit"
                  ? "Volver al listado"
                  : "Elegir uno existente"}
              </button>
              <BarMaterialForm
                key={
                  picker.view === "edit"
                    ? picker.item.id
                    : `new-${picker.view}`
                }
                item={picker.view === "edit" ? picker.item : undefined}
                token={token}
                materials={materials}
                embedded
                submitLabel={
                  picker.view === "create"
                    ? "Crear y cargar stock"
                    : "Guardar insumo"
                }
                onCancel={() => setPicker({ view: "search" })}
                onCreated={(item) => {
                  onMaterialCreated(item);
                  if (picker.view === "edit") {
                    closePicker();
                    return;
                  }
                  setExtraIds((prev) => [...prev, item.id]);
                  setEditing(item.id);
                  setExpected("0");
                  setQuantity("");
                  setCost("");
                  setMode("add");
                  setError("");
                  closePicker();
                  setQuery("");
                  setFilter("all");
                }}
              />
            </>
          )}
        </section>
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
          <div
            className="bw-segmented"
            role="group"
            aria-label="Filtrar stock"
          >
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
              Agotadas{emptyCount > 0 && <span>{emptyCount}</span>}
            </button>
          </div>
        </div>
      )}
      {tracked.length === 0 ? (
        <div className="bw-empty">
          <Package size={30} />
          <h4>Las existencias de esta barra, en un lugar</h4>
          <p>
            Agregá mercadería con <strong>Agregar stock</strong> o definí qué
            insumos usan tus productos desde el menú.
          </p>
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
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                  Producto
                </TableHead>
                <TableHead className="text-right text-[11px] font-normal lowercase text-white/45">
                  En barra
                </TableHead>
                <TableHead className="w-[170px] pr-4">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {rows.map((item) => {
                const consumers = usedBy.get(item.inventoryItemId) ?? [];
                const empty = new Decimal(item.barCurrentStock).lte(0);
                const edit = editing === item.inventoryItemId;
                const description = `${
                  item.productId
                    ? "Producto por unidad"
                    : packageDescription(item)
                } · ${
                  consumers.length > 0
                    ? `${consumers.length} ${consumers.length === 1 ? "producto" : "productos"}`
                    : item.productId
                      ? "por unidad"
                      : "sin productos"
                }`;
                const next = validQuantity(quantity)
                  ? mode === "add"
                    ? new Decimal(expected)
                        .div(packageFactor(item))
                        .plus(decimalInput(quantity))
                        .toString()
                    : decimalInput(quantity)
                  : null;
                return (
                  <Fragment key={item.inventoryItemId}>
                    <TableRow
                      id={`stock-row-${item.inventoryItemId}`}
                      className="border-0 hover:bg-white/[0.03]"
                    >
                      <TableCell className="max-w-[420px] py-3.5 pl-4">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={`truncate text-[14px] font-medium ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                          >
                            {item.name}
                          </span>
                          <span className="truncate text-[12px] text-white/40">
                            {description}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="whitespace-nowrap py-3.5 text-right"
                        title={`${quantityLabel(item.barCurrentStock)} ${baseUnitLabel(item)}`}
                      >
                        <span
                          className={`text-[14px] font-medium tabular-nums ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                        >
                          {packageQuantityLabel(stockInPackages(item))}
                        </span>{" "}
                        <span className="text-[12px] text-white/40">
                          {stockUnit(item)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 pr-4 text-right">
                        <button
                          className="bw-secondary bw-table-action whitespace-nowrap"
                          disabled={busy}
                          aria-label={
                            edit
                              ? `Cerrar edición de stock de ${item.name}`
                              : `Ingresar o contar stock de ${item.name}`
                          }
                          onClick={() =>
                            edit ? setEditing(null) : open(item)
                          }
                        >
                          {edit ? "Cerrar" : "Ingresar o contar"}
                        </button>
                      </TableCell>
                    </TableRow>
                    {edit && (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={3} className="p-0 whitespace-normal">
                          <div
                            className="bw-stock-editor"
                            onKeyDown={(event) => {
                      if (event.key === "Escape" && !busy) {
                        event.preventDefault();
                        setEditing(null);
                      }
                    }}
                  >
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
                          {packageQuantityLabel(
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
                          {next == null
                            ? "—"
                            : packageQuantityLabel(next)}{" "}
                          {stockUnit(item)}
                        </strong>
                      </span>
                    </div>
                    <div className="bw-stock-links">
                      {item.productId ? (
                        <button
                          type="button"
                          className="bw-text-button"
                          onClick={() => onShowProduct(item.productId!)}
                        >
                          Ver producto en el menú
                        </button>
                      ) : (
                        <>
                          {consumers.length > 0 && (
                            <p>
                              Se usa en{" "}
                              {consumers.map((product, index) => (
                                <span key={product.id}>
                                  {index > 0 ? ", " : ""}
                                  <button
                                    type="button"
                                    className="bw-text-button"
                                    onClick={() => onShowProduct(product.id)}
                                  >
                                    {product.name}
                                  </button>
                                </span>
                              ))}
                            </p>
                          )}
                          <button
                            type="button"
                            className="bw-quiet-button"
                            onClick={() => {
                              const material = materials.find(
                                (row) => row.id === item.inventoryItemId,
                              );
                              if (material) {
                                setEditing(null);
                                closePicker();
                                setPicker({ view: "edit", item: material });
                              }
                            }}
                          >
                            <Pencil size={14} />
                            Editar insumo
                          </button>
                        </>
                      )}
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
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
