import { useState } from "react";
import {
  Check,
  ChevronRight,
  Package,
  PackagePlus,
  Plus,
  Search,
  Utensils,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiProduct } from "@/components/inventory/recipe-config";
import type {
  BarInventoryItemRow,
  BarMenuProductRow,
} from "@/types/event-dashboard";
import {
  moneyLabel,
  normalizeSearch,
  productAvailabilityDetail,
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
  query: string;
  onQueryChange: (query: string) => void;
};
type Filter = "all" | "empty" | "untracked";

export function BarMenuPanel({
  catalog,
  menu,
  inventory,
  trackStock,
  busy,
  onToggle,
  onCreate,
  onEdit,
  query,
  onQueryChange,
}: Props) {
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const active = menu.filter((row) => row.isActiveForBar);
  const activeIds = new Set(active.map((row) => row.id));
  const available = catalog.filter(
    (product) =>
      !activeIds.has(product.id) &&
      normalizeSearch(product.name).includes(normalizeSearch(pickerQuery)),
  );
  const detailFor = (product: ApiProduct, directStock?: string | null) =>
    trackStock
      ? productAvailabilityDetail(product, inventory, directStock)
      : { count: null, limiter: null };
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
      const { count } = detailFor(product, directStock);
      return filter === "empty" ? count === 0 : count == null;
    });
  const emptyCount = active.filter((row) => {
    const product = catalog.find((item) => item.id === row.id);
    return product ? detailFor(product, row.directStock).count === 0 : false;
  }).length;

  return (
    <section aria-label="Menú de la barra">
      <div className="bw-tab-head">
        <p className="bw-lede">
          {active.length}{" "}
          {active.length === 1 ? "producto a la venta" : "productos a la venta"}
          {emptyCount > 0 && (
            <span className="bw-lede-warning"> · {emptyCount} sin stock</span>
          )}
        </p>
        <div className="bw-form-actions">
          <button className="bw-secondary" onClick={() => setPicker(true)}>
            <PackagePlus size={16} />
            Del catálogo
          </button>
          <button className="bw-primary" onClick={onCreate}>
            <Plus size={17} />
            Nuevo producto
          </button>
        </div>
      </div>
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
            <div
              className="bw-segmented"
              role="group"
              aria-label="Filtrar el menú por disponibilidad"
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
                Sin stock{emptyCount > 0 && <span>{emptyCount}</span>}
              </button>
              <button
                aria-pressed={filter === "untracked"}
                onClick={() => setFilter("untracked")}
              >
                Sin control
              </button>
            </div>
          )}
        </div>
      )}
      {active.length === 0 ? (
        <div className="bw-empty">
          <Utensils size={32} />
          <h4>Armá el menú de esta barra</h4>
          <p>
            Sumá productos de tu catálogo con <strong>Del catálogo</strong> o
            creá uno nuevo para este evento.
          </p>
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
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                  Producto
                </TableHead>
                <TableHead className="text-right text-[11px] font-normal lowercase text-white/45">
                  Precio
                </TableHead>
                {trackStock && (
                  <TableHead className="text-center text-[11px] font-normal lowercase text-white/45">
                    Disponible
                  </TableHead>
                )}
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Abrir producto</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {rows.map((row) => {
                const product = row.product;
                if (!product) return null;
                const { count, limiter } = detailFor(
                  product,
                  row.directStock,
                );
                const note =
                  product.recipes.length === 0
                    ? count == null
                      ? "Sin control de stock"
                      : "Por unidad"
                    : count === 0 && limiter
                      ? `Falta ${limiter.inventoryItemName}`
                      : count != null && count <= 5 && limiter
                        ? `Quedan ${count} por ${limiter.inventoryItemName}`
                        : `${product.recipes.length} ${product.recipes.length === 1 ? "insumo" : "insumos"}`;
                return (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    aria-label={`Abrir ${row.name}`}
                    onClick={() => onEdit(product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEdit(product);
                      }
                    }}
                    className="cursor-pointer border-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-[#ff9500] focus-visible:-outline-offset-2"
                  >
                    <TableCell className="max-w-[360px] py-3.5 pl-4">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[15px] font-medium text-foreground">
                          {row.name}
                        </span>
                        {trackStock && (
                          <span className="truncate text-[12px] text-white/40">
                            {note}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-[13px] font-medium tabular-nums text-white/80">
                      {moneyLabel(row.price)}
                    </TableCell>
                    {trackStock && (
                      <TableCell className="py-3.5 text-center">
                        <span
                          className={`bw-availability ${count === 0 ? "empty" : count == null ? "untracked" : "ready"}`}
                        >
                          {count === 0 ? (
                            <>
                              <Package size={14} aria-hidden="true" />
                              Sin stock
                            </>
                          ) : count == null ? (
                            "Sin límite"
                          ) : (
                            <>
                              <Check size={14} aria-hidden="true" />
                              {quantityLabel(count)} unidades
                            </>
                          )}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="py-3.5 pr-4">
                      <ChevronRight
                        size={18}
                        className="ml-auto text-white/30"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog
        open={picker}
        onOpenChange={(open) => {
          setPicker(open);
          if (!open) setPickerQuery("");
        }}
      >
        <DialogContent
          className="bar-workspace bw-dialog sm:max-w-lg"
          overlayClassName="bg-black/70"
          showCloseButton={false}
        >
          <div className="bw-dialog-head">
            <div>
              <DialogTitle className="bw-dialog-title">
                Agregar del catálogo
              </DialogTitle>
              <DialogDescription className="bw-dialog-hint">
                Elegí productos ya creados por la productora. Podés sumar
                varios seguidos.
              </DialogDescription>
            </div>
            <button
              type="button"
              className="bw-icon-button"
              aria-label="Cerrar"
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
          <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
            {available.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                      Producto
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-normal lowercase text-white/45">
                      Precio
                    </TableHead>
                    <TableHead className="w-[110px] pr-4">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                  {available.map((product) => (
                    <TableRow
                      key={product.id}
                      className="border-0 hover:bg-white/[0.03]"
                    >
                      <TableCell className="max-w-[260px] py-3.5 pl-4">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-[14px] font-medium text-foreground">
                            {product.name}
                          </span>
                          {product.recipes.length > 0 && (
                            <span className="truncate text-[12px] text-white/40">
                              {product.recipes.length}{" "}
                              {product.recipes.length === 1
                                ? "insumo"
                                : "insumos"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right text-[13px] tabular-nums text-white/55">
                        {moneyLabel(
                          menu.find((row) => row.id === product.id)?.price ??
                            product.price,
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 pr-4 text-right">
                        <button
                          className="bw-secondary bw-table-action"
                          disabled={busy !== null}
                          aria-label={`Agregar ${product.name} al menú de la barra`}
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-6 text-[13px] text-white/45">
                {pickerQuery
                  ? "No hay productos con ese nombre."
                  : "Todos los productos del catálogo ya están en esta barra."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
