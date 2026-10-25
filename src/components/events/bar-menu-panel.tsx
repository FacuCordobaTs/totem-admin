import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Package,
  Pencil,
  Plus,
  Search,
  Utensils,
  X,
} from "lucide-react";
import type { ApiProduct } from "@/components/inventory/recipe-config";
import type {
  BarInventoryItemRow,
  BarMenuProductRow,
} from "@/types/event-dashboard";
import {
  consumptionPerSale,
  moneyLabel,
  normalizeSearch,
  packageFactor,
  productAvailability,
  quantityLabel,
} from "./bar-workspace-model";

type Props = {
  catalog: ApiProduct[];
  menu: BarMenuProductRow[];
  inventory: BarInventoryItemRow[];
  trackStock: boolean;
  busy: string | null;
  onToggle: (id: string, active: boolean) => void;
  onCreate: () => void;
  onEdit: (product: ApiProduct) => void;
  onStock: () => void;
  query: string;
  onQueryChange: (query: string) => void;
};
export function BarMenuPanel({
  catalog,
  menu,
  inventory,
  trackStock,
  busy,
  onToggle,
  onCreate,
  onEdit,
  onStock,
  query,
  onQueryChange,
}: Props) {
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "empty" | "untracked">("all");
  const active = menu.filter((row) => row.isActiveForBar);
  const activeIds = new Set(active.map((row) => row.id));
  const available = catalog.filter(
    (product) =>
      !activeIds.has(product.id) &&
      normalizeSearch(product.name).includes(normalizeSearch(pickerQuery)),
  );
  const rows = active
    .map((row) => ({
      ...row,
      product: catalog.find((product) => product.id === row.id),
    }))
    .filter(({ name, product }) =>
      normalizeSearch(
        `${name} ${product?.recipes.map((line) => line.inventoryItemName).join(" ") ?? ""}`,
      ).includes(normalizeSearch(query)),
    )
    .filter(({ product, directStock }) => {
      if (!product || filter === "all") return true;
      const count = productAvailability(product, inventory, directStock);
      return filter === "empty" ? count === 0 : count == null;
    });
  return (
    <section>
      <div className="bw-heading">
        <div>
          <h3>Menú de la barra</h3>
          <p>
            {active.length}{" "}
            {active.length === 1
              ? "producto a la venta"
              : "productos a la venta"}
          </p>
        </div>
        <div className="bw-form-actions">
          <button className="bw-secondary" onClick={() => setPicker(!picker)}>
            <Plus size={16} />
            Del catálogo
          </button>
          <button className="bw-primary" onClick={onCreate}>
            <Plus size={17} />
            Nuevo producto
          </button>
        </div>
      </div>
      {picker && (
        <div className="bw-catalog-picker">
          <div className="bw-heading">
            <h4>Agregar al menú</h4>
            <button
              className="bw-icon-button"
              aria-label="Cerrar catálogo"
              onClick={() => setPicker(false)}
            >
              <X size={17} />
            </button>
          </div>
          <label className="bw-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Buscar en el catálogo"
              placeholder="Buscar producto del catálogo"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
          </label>
          <div className="bw-picker-results">
            {available.length ? (
              available.map((product) => (
                <div key={product.id} className="bw-picker-row">
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {moneyLabel(
                        menu.find((row) => row.id === product.id)?.price ??
                          product.price,
                      )}
                    </small>
                  </span>
                  <button
                    className="bw-secondary"
                    disabled={busy !== null}
                    onClick={() => onToggle(product.id, true)}
                  >
                    {busy === product.id ? (
                      "Agregando…"
                    ) : (
                      <>
                        <Plus size={15} />
                        Agregar
                      </>
                    )}
                  </button>
                </div>
              ))
            ) : (
              <p className="bw-muted">
                {pickerQuery
                  ? "No hay productos con ese nombre."
                  : "Todos los productos del catálogo ya están en esta barra."}
              </p>
            )}
          </div>
        </div>
      )}
      {active.length > 0 && (
        <div className="bw-toolbar">
          <label className="bw-search">
            <Search size={17} />
            <input
              aria-label="Buscar en el menú"
              placeholder="Buscar producto o insumo"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </label>
          {trackStock && (
            <select
              className="bw-filter"
              aria-label="Filtrar disponibilidad"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
            >
              <option value="all">Todos los productos</option>
              <option value="empty">Sin stock</option>
              <option value="untracked">Sin control de stock</option>
            </select>
          )}
        </div>
      )}
      {active.length === 0 ? (
        <div className="bw-empty">
          <Utensils size={32} />
          <h4>Armá el menú de esta barra</h4>
          <p>Sumá productos del catálogo o creá uno nuevo acá mismo.</p>
          <button className="bw-primary" onClick={onCreate}>
            <Plus size={17} />
            Crear producto
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bw-empty">
          <h4>No hay productos con este filtro</h4>
          <button
            className="bw-secondary"
            onClick={() => {
              onQueryChange("");
              setFilter("all");
            }}
          >
            Ver todo el menú
          </button>
        </div>
      ) : (
        <div className="bw-menu-list">
          <div className={`bw-menu-columns ${!trackStock ? "no-stock" : ""}`}>
            <span>Producto</span>
            <span>Precio</span>
            {trackStock && <span>Disponible para vender</span>}
            <span />
          </div>
          {rows.map((row) => {
            const product = row.product;
            if (!product) return null;
            const count = trackStock
              ? productAvailability(product, inventory, row.directStock)
              : null;
            const open = expanded === product.id;
            return (
              <div key={row.id} className="bw-menu-item">
                <div className={`bw-menu-row ${!trackStock ? "no-stock" : ""}`}>
                  <button
                    className="bw-product-name"
                    aria-expanded={open}
                    aria-controls={`recipe-${row.id}`}
                    onClick={() => setExpanded(open ? null : row.id)}
                  >
                    <span>
                      <strong>{row.name}</strong>
                      {trackStock && (
                        <small>
                          {product.recipes.length
                            ? product.recipes.length === 1
                              ? product.recipes[0].inventoryItemName
                              : `${product.recipes.length} insumos`
                            : count !== null
                              ? "Por unidad"
                              : "Sin control de stock"}
                        </small>
                      )}
                    </span>
                    <ChevronDown
                      size={16}
                      className={open ? "bw-chevron open" : "bw-chevron"}
                    />
                  </button>
                  <span className="bw-menu-price">{moneyLabel(row.price)}</span>
                  {trackStock && (
                    <button
                      className={`bw-availability ${count === 0 ? "empty" : count == null ? "untracked" : "ready"}`}
                      onClick={count == null ? () => onEdit(product) : onStock}
                    >
                      {count === 0 ? (
                        <>
                          <Package size={14} />
                          Sin stock
                        </>
                      ) : count == null ? (
                        "Definir stock"
                      ) : (
                        <>
                          <Check size={14} />
                          {quantityLabel(count)} unidades
                        </>
                      )}
                    </button>
                  )}
                  <button
                    className="bw-icon-button"
                    aria-label={`Editar ${product.name}`}
                    onClick={() => onEdit(product)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                {open && (
                  <div className="bw-product-expanded" id={`recipe-${row.id}`}>
                    {trackStock && product.recipes.length > 0 ? (
                      <>
                        <h4>Qué descuenta cada venta</h4>
                        <div className="bw-recipe-readout">
                          {product.recipes.map((line) => {
                            const perSale = consumptionPerSale(product, line);
                            const factor = packageFactor({
                              baseUnit: line.inventoryBaseUnit,
                              packageSize: line.inventoryPackageSize,
                            });
                            const yieldCount = perSale.gt(0)
                              ? factor
                                  .div(perSale)
                                  .toDecimalPlaces(3)
                                  .toString()
                              : "0";
                            return (
                              <div key={line.id}>
                                <strong>{line.inventoryItemName}</strong>
                                <span>
                                  1{" "}
                                  {line.inventoryBaseUnit === "ML"
                                    ? "botella"
                                    : line.inventoryBaseUnit === "GRAMS"
                                      ? "paquete"
                                      : "unidad"}{" "}
                                  <ArrowRight size={14} />
                                  {quantityLabel(yieldCount)} {row.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <button className="bw-text-button" onClick={onStock}>
                          Ver existencias en la barra
                          <ArrowRight size={15} />
                        </button>
                      </>
                    ) : trackStock && count !== null ? (
                      <div className="bw-form-actions">
                        <span className="bw-muted">
                          Cada venta descuenta 1 unidad.
                        </span>
                        <button className="bw-text-button" onClick={onStock}>
                          Actualizar stock
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    ) : trackStock ? (
                      <div className="bw-form-actions">
                        <span className="bw-muted">
                          Este producto no descuenta insumos.
                        </span>
                        <button
                          className="bw-text-button"
                          onClick={() => onEdit(product)}
                        >
                          Definir cómo contar el stock
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    ) : null}
                    <div className="bw-expanded-actions">
                      <button
                        className="bw-secondary"
                        onClick={() => onEdit(product)}
                      >
                        <Pencil size={15} />
                        Editar producto
                      </button>
                      <button
                        className="bw-danger-text"
                        disabled={busy !== null}
                        onClick={() => onToggle(row.id, false)}
                      >
                        {busy === row.id ? "Quitando…" : "Quitar de esta barra"}
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
