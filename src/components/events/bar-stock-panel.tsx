import { Fragment, useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { Check, Package, Plus, Search, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiInventoryItem, ApiProduct } from "@/types/inventory";
import type { BarInventoryItemRow } from "@/types/event-dashboard";
import { NewMaterialRow } from "./bar-new-material-row";
import {
  byRecentCreation,
  decimalInput,
  isEmptyStock,
  normalizeSearch,
  unitProductItemId,
  type StockFocus,
  quantityLabel,
  stockLabel,
  validQuantity,
} from "./bar-workspace-model";


type Props = {
  token: string | null;
  barId: string;
  products: ApiProduct[];
  inventory: BarInventoryItemRow[];
  materials: ApiInventoryItem[];
  focus: StockFocus | null;
  onClearFocus: () => void;
  onSaved: () => Promise<void>;
  onMaterialCreated: (item: ApiInventoryItem) => void;
  onShowProduct: (id: string) => void;
};

export function BarStockPanel({
  token,
  barId,
  products,
  inventory,
  materials,
  focus,
  onClearFocus,
  onSaved,
  onMaterialCreated,
  onShowProduct,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "empty">("all");
  const [creating, setCreating] = useState(false);
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
  // Productos por unidad: su insumo propio es la fila de stock del producto.
  const unitOwners = new Map<string, ApiProduct>();
  for (const product of products) {
    const itemId = unitProductItemId(product);
    if (itemId) unitOwners.set(itemId, product);
  }
  // Insumos del más reciente al más viejo.
  const tracked = [...inventory]
    .filter(
      (item) =>
        usedBy.has(item.inventoryItemId) ||
        item.barInventoryRowId ||
        extraIds.includes(item.inventoryItemId),
    )
    .sort(byRecentCreation);
  const focusIds = focus ? new Set(focus.ids) : null;
  const rows = focusIds
    ? tracked.filter((item) => focusIds.has(item.inventoryItemId))
    : tracked.filter(
        (item) =>
          normalizeSearch(
            `${item.name} ${(usedBy.get(item.inventoryItemId) ?? []).map((p) => p.name).join(" ")}`,
          ).includes(normalizeSearch(query)) &&
          (filter !== "empty" || isEmptyStock(item.barCurrentStock)),
      );
  const emptyCount = tracked.filter((item) =>
    isEmptyStock(item.barCurrentStock),
  ).length;
  useEffect(() => {
    if (!editing) return;
    document
      .getElementById(`stock-row-${editing}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [editing]);
  useEffect(() => {
    if (focus) setEditing(null);
  }, [focus]);

  function startCreate() {
    setEditing(null);
    onClearFocus();
    setQuery("");
    setFilter("all");
    setCreating(true);
  }
  function open(item: BarInventoryItemRow) {
    setEditing(item.inventoryItemId);
    setExpected(item.barCurrentStock);
    setQuantity("");
    setCost("");
    setMode("add");
    setError("");
  }
  async function save(item: BarInventoryItemRow) {
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
    if (
      mode === "add" &&
      cost.trim() &&
      !/^\d{1,8}(\.\d{1,2})?$/.test(decimalInput(cost))
    ) {
      setError("Revisá el costo: usá hasta dos decimales.");
      return;
    }
    // Absolute target + captured base snapshot makes resending safe after a lost response.
    const target = (
      mode === "add"
        ? new Decimal(expected).plus(decimalInput(quantity))
        : new Decimal(decimalInput(quantity))
    )
      .toDecimalPlaces(6)
      .toString();
    setBusy(true);
    try {
      await apiFetch(`/bars/${barId}/stock`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          inventoryItemId: item.inventoryItemId,
          quantity: target,
          expectedCurrentStock: new Decimal(expected)
            .toDecimalPlaces(6)
            .toString(),
          stockInputAs: "BASE_UNITS",
          ...(mode === "add" && cost.trim()
            ? { totalCost: decimalInput(cost) }
            : {}),
        }),
      });
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
          className="bw-secondary"
          onClick={startCreate}
          disabled={busy || creating}
        >
          <Plus size={17} />
          Nuevo insumo
        </button>
      </div>
      {focus ? (
        <div className="bw-stock-focus" role="status">
          <p>
            Insumos de <strong>{focus.label}</strong>
          </p>
          <button
            type="button"
            className="bw-secondary bw-table-action"
            onClick={onClearFocus}
          >
            <X size={14} aria-hidden="true" />
            Ver todo el stock
          </button>
        </div>
      ) : (
        tracked.length > 0 && (
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
        )
      )}
      {tracked.length === 0 && !creating ? (
        <div className="bw-empty">
          <Package size={30} />
          <h4>Las existencias de esta barra, en un lugar</h4>
          <p>
            Creá insumos con <strong>Nuevo insumo</strong> o configurá la receta
            de tus productos desde el menú.
          </p>
        </div>
      ) : rows.length === 0 && !creating ? (
        <div className="bw-empty">
          <h4>
            {focus
              ? "Este producto todavía no tiene existencias"
              : "No hay existencias con este filtro"}
          </h4>
          <button
            className="bw-secondary"
            onClick={() => {
              onClearFocus();
              setQuery("");
              setFilter("all");
            }}
          >
            Ver todo el stock
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table className="table-fixed sm:table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                  Producto
                </TableHead>
                <TableHead className="w-[28%] text-right text-[11px] font-normal lowercase text-white/45 sm:w-auto">
                  En barra
                </TableHead>
                <TableHead className="w-[28%] pr-4 sm:w-[170px]">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {creating && (
                <NewMaterialRow
                  token={token}
                  materials={materials}
                  middleCells={1}
                  onCancel={() => setCreating(false)}
                  onCreated={(item) => {
                    onMaterialCreated(item);
                    setExtraIds((prev) => [...prev, item.id]);
                    setCreating(false);
                  }}
                />
              )}
              {rows.map((item) => {
                const consumers = usedBy.get(item.inventoryItemId) ?? [];
                const empty = isEmptyStock(item.barCurrentStock);
                const edit = editing === item.inventoryItemId;
                const owner = unitOwners.get(item.inventoryItemId);
                const others = consumers
                  .filter((product) => product.id !== owner?.id)
                  .map((product) => product.name);
                const description = owner
                  ? ["Por unidad", ...others].join(" · ")
                  : others.length > 0
                    ? others.join(", ")
                    : "Sin productos";
                const next = validQuantity(quantity)
                  ? mode === "add"
                    ? new Decimal(expected).plus(decimalInput(quantity)).toString()
                    : decimalInput(quantity)
                  : null;
                return (
                  <Fragment key={item.inventoryItemId}>
                    <TableRow
                      id={`stock-row-${item.inventoryItemId}`}
                      className={`border-0 ${focus ? "bg-[#FF9500]/10 hover:bg-[#FF9500]/10" : "hover:bg-white/[0.03]"}`}
                    >
                      <TableCell className="max-w-[420px] py-3.5 pl-4">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={`truncate text-[14px] font-medium ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <span
                            className="hidden truncate text-[12px] text-white/40 sm:inline"
                            title={description}
                          >
                            {description}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="whitespace-nowrap py-3.5 text-right"
                        title={`${quantityLabel(item.barCurrentStock)} unidades`}
                      >
                        <span
                          className={`text-[14px] font-medium tabular-nums ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                        >
                          {stockLabel(item.barCurrentStock)}
                        </span>{" "}
                        <span className="text-[12px] text-white/40">
                          {new Decimal(item.barCurrentStock).eq(1)
                            ? "unidad"
                            : "unidades"}
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
                          {edit ? (
                            "Cerrar"
                          ) : (
                            <>
                              <span className="sm:hidden">Cargar</span>
                              <span className="hidden sm:inline">
                                Ingresar o contar
                              </span>
                            </>
                          )}
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
                        (unidades)
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
                          {stockLabel(expected)}
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
                          {next == null ? "—" : stockLabel(next)}{" "}
                          unidades
                        </strong>
                      </span>
                    </div>
                    <div className="bw-stock-links">
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
