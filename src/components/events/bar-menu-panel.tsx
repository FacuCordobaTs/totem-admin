import { useState } from "react";
import { PackagePlus, Pencil, Plus, Search, Utensils, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ApiInventoryItem,
  ApiProduct,
  ProductSaleType,
} from "@/types/inventory";
import type {
  BarInventoryItemRow,
  BarMenuProductRow,
} from "@/types/event-dashboard";
import { BarRecipeDialog } from "./bar-recipe-dialog";
import {
  SALE_TYPES,
  recipeDraftFromLines,
  type RecipeDraftLine,
  type RecipeMode,
  moneyLabel,
  normalizeSearch,
  productAvailabilityDetail,
  productSaleType,
  quantityLabel,
  usesRecipe,
} from "./bar-workspace-model";

type Props = {
  token: string | null;
  catalog: ApiProduct[];
  menu: BarMenuProductRow[];
  inventory: BarInventoryItemRow[];
  materials: ApiInventoryItem[];
  trackStock: boolean;
  busy: string | null;
  onToggle: (id: string, active: boolean) => void;
  onCreate: () => void;
  onEdit: (product: ApiProduct) => void;
  onSaleTypeChange: (productId: string, saleType: ProductSaleType) => void;
  onSaveRecipe: (
    productId: string,
    mode: RecipeMode,
    lines: RecipeDraftLine[],
  ) => Promise<boolean>;
  onMaterialCreated: (item: ApiInventoryItem) => void;
  onShowStock: (product: ApiProduct) => void;
  query: string;
  onQueryChange: (query: string) => void;
};

export function BarMenuPanel({
  token,
  catalog,
  menu,
  inventory,
  materials,
  trackStock,
  busy,
  onToggle,
  onCreate,
  onEdit,
  onSaleTypeChange,
  onSaveRecipe,
  onMaterialCreated,
  onShowStock,
  query,
  onQueryChange,
}: Props) {
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [recipeFor, setRecipeFor] = useState<{
    product: ApiProduct;
    mode: RecipeMode;
  } | null>(null);
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
      : { count: null, limiter: null, missing: [] };
  const rows = active
    .map((row) => ({
      ...row,
      product: catalog.find((product) => product.id === row.id),
    }))
    .filter(({ name, product }) =>
      normalizeSearch(
        `${name} ${product?.recipes.map((line) => line.inventoryItemName).join(" ") ?? ""}`,
      ).includes(normalizeSearch(query)),
    );
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
            <span className="sm:hidden">Del catálogo</span>
            <span className="hidden sm:inline">
              Asignar producto del catálogo
            </span>
          </button>
          <button className="bw-secondary" onClick={onCreate}>
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
        </div>
      )}
      {active.length === 0 ? (
        <div className="bw-empty">
          <Utensils size={32} />
          <h4>Armá el menú de esta barra</h4>
          <p>
            Sumá productos de tu catálogo con{" "}
            <strong>Asignar producto del catálogo</strong> o creá uno nuevo para
            este evento.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bw-empty">
          <h4>No hay productos con esa búsqueda</h4>
          <button className="bw-secondary" onClick={() => onQueryChange("")}>
            Ver todo el menú
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
                <TableHead className="w-[76px] text-right text-[11px] font-normal lowercase text-white/45 sm:w-[96px]">
                  Precio
                </TableHead>
                {trackStock && (
                  <>
                    <TableHead className="hidden w-[148px] text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                      Venta
                    </TableHead>
                    <TableHead className="w-[96px] text-center text-[11px] font-normal lowercase text-white/45 sm:w-[176px]">
                      Disponible
                    </TableHead>
                  </>
                )}
                <TableHead className="w-[44px] pr-4 sm:w-12">
                  <span className="sr-only">Editar producto</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {rows.map((row) => {
                const product = row.product;
                if (!product) return null;
                const saleType = productSaleType(product, row.directStock);
                const { count, limiter, missing } = detailFor(
                  product,
                  row.directStock,
                );
                const configured =
                  !usesRecipe(saleType) || product.recipes.length > 0;
                const note = !trackStock
                  ? ""
                  : usesRecipe(saleType) && configured
                    ? count === 0 && missing.length
                      ? `Falta ${missing.map((line) => line.inventoryItemName).join(", ")}`
                      : count != null && count <= 5 && limiter
                        ? `Quedan ${count} por ${limiter.inventoryItemName}`
                        : product.recipes
                            .map((line) => line.inventoryItemName)
                            .join(" + ")
                    : "";
                // La fila hace lo mismo que su acción de disponibilidad; la tienen
                // también los botones de la celda para teclado y lectores de pantalla.
                const rowAction = !trackStock || saleType === "NONE"
                  ? null
                  : !configured
                    ? () =>
                        setRecipeFor({ product, mode: saleType as RecipeMode })
                    : () => onShowStock(product);
                return (
                  <TableRow
                    key={row.id}
                    onClick={busy === null ? (rowAction ?? undefined) : undefined}
                    className={`group border-0 hover:bg-white/[0.03] ${rowAction ? "cursor-pointer" : ""}`}
                  >
                    <TableCell className="max-w-[360px] py-3.5 pl-4">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span
                          className="min-w-0 truncate text-[13px] font-medium text-foreground sm:text-[15px]"
                          title={row.name}
                        >
                          {row.name}
                        </span>
                        {note && (
                          <span
                            className="hidden truncate text-[12px] text-white/40 lg:inline"
                            title={note}
                          >
                            {note}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-[12px] font-medium tabular-nums text-white/80 sm:text-[13px]">
                      {moneyLabel(row.price)}
                    </TableCell>
                    {trackStock && (
                      <>
                        <TableCell
                          className="hidden py-2 sm:table-cell"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Select
                            value={saleType}
                            disabled={busy !== null}
                            onValueChange={(value) => {
                              if (value !== saleType)
                                onSaleTypeChange(
                                  product.id,
                                  value as ProductSaleType,
                                );
                            }}
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label={`Cómo se vende ${row.name}`}
                              className="bw-sale-select"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0a]">
                              {SALE_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell
                          className="py-2 text-center"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {saleType === "NONE" ? (
                            <span className="sm:hidden">
                              <span className="bw-availability untracked">
                                Sin control
                              </span>
                            </span>
                          ) : !configured ? (
                            <button
                              type="button"
                              className="bw-secondary bw-table-action whitespace-nowrap"
                              disabled={busy !== null}
                              onClick={() =>
                                setRecipeFor({
                                  product,
                                  mode: saleType as RecipeMode,
                                })
                              }
                            >
                              <span className="sm:hidden">Configurar</span>
                              <span className="hidden sm:inline">
                                {saleType === "GLASS"
                                  ? "Configurar receta"
                                  : "Configurar botellas"}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`bw-availability bw-availability-link ${count === 0 ? "empty" : "ready"}`}
                              aria-label={
                                count === 0
                                  ? `${row.name} sin stock: ver en Stock`
                                  : `${row.name}: ${count} disponibles, ver en Stock`
                              }
                              onClick={() => onShowStock(product)}
                            >
                              {count === 0 ? (
                                "Sin stock"
                              ) : (
                                <>
                                  {quantityLabel(count ?? 0)}
                                  <span className="hidden sm:inline">
                                    &nbsp;
                                    {count === 1 ? "disponible" : "disponibles"}
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="py-2 pr-4 text-right">
                      <button
                        type="button"
                        className="bw-icon-button bw-row-edit"
                        aria-label={`Editar ${row.name}`}
                        title="Editar"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(product);
                        }}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {recipeFor && (
        <BarRecipeDialog
          open
          key={`${recipeFor.product.id}-${recipeFor.mode}`}
          onOpenChange={(open) => {
            if (!open) setRecipeFor(null);
          }}
          token={token}
          mode={recipeFor.mode}
          productName={recipeFor.product.name}
          materials={materials}
          initialLines={recipeDraftFromLines(
            recipeFor.mode,
            recipeFor.product.recipes,
          )}
          onMaterialCreated={onMaterialCreated}
          onSave={async (lines) => {
            const saved = await onSaveRecipe(
              recipeFor.product.id,
              recipeFor.mode,
              lines,
            );
            if (saved) setRecipeFor(null);
            return saved;
          }}
        />
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
                Asignar producto del catálogo
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
              <Table className="table-fixed sm:table-auto">
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                      Producto
                    </TableHead>
                    <TableHead className="w-[74px] text-right text-[11px] font-normal lowercase text-white/45 sm:w-auto">
                      Precio
                    </TableHead>
                    <TableHead className="w-[108px] pr-4 sm:w-[110px]">
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
                            <span className="hidden truncate text-[12px] text-white/40 sm:inline">
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
