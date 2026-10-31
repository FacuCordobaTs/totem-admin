import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Decimal from "decimal.js";
import {
  Check,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** En pantallas angostas Ingresar/Contar se agrupan en el menú "…" de la fila. */
const COMPACT_ACTIONS_QUERY = "(max-width: 639px)";

function useCompactRowActions() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(COMPACT_ACTIONS_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(COMPACT_ACTIONS_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}


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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<BarInventoryItemRow | null>(null);
  const [itemBusy, setItemBusy] = useState(false);
  const compactActions = useCompactRowActions();
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
  function startRename(item: BarInventoryItemRow) {
    setEditing(null);
    setRenaming(item.inventoryItemId);
    setRenameValue(item.name);
  }
  async function rename(item: BarInventoryItemRow) {
    const name = renameValue.trim();
    if (!token || itemBusy || !name) return;
    if (name === item.name) {
      setRenaming(null);
      return;
    }
    if (
      materials.some(
        (material) =>
          material.id !== item.inventoryItemId &&
          normalizeSearch(material.name.trim()) === normalizeSearch(name),
      )
    ) {
      toast.error("Ya existe un insumo con ese nombre.");
      return;
    }
    setItemBusy(true);
    try {
      await apiFetch("/inventory/items", {
        method: "POST",
        token,
        body: JSON.stringify({ id: item.inventoryItemId, name }),
      });
      await onSaved();
      setRenaming(null);
      toast.success("Insumo renombrado");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo renombrar el insumo",
      );
    } finally {
      setItemBusy(false);
    }
  }
  async function remove(item: BarInventoryItemRow) {
    if (!token || itemBusy) return;
    setItemBusy(true);
    try {
      await apiFetch(`/inventory/items/${item.inventoryItemId}`, {
        method: "DELETE",
        token,
      });
      setExtraIds((prev) => prev.filter((id) => id !== item.inventoryItemId));
      await onSaved();
      toast.success("Insumo eliminado");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo eliminar el insumo",
      );
    } finally {
      setItemBusy(false);
      setDeleting(null);
    }
  }
  function open(item: BarInventoryItemRow, next: "add" | "count") {
    setRenaming(null);
    setEditing(item.inventoryItemId);
    setExpected(item.barCurrentStock);
    setQuantity("");
    setCost("");
    setMode(next);
  }
  async function save(item: BarInventoryItemRow) {
    if (!token || busy) return;
    if (
      !validQuantity(quantity) ||
      (mode === "add" && new Decimal(decimalInput(quantity)).lte(0))
    ) {
      toast.error(
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
      toast.error("Revisá el costo: usá hasta dos decimales.");
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
      if (e instanceof ApiError && e.status === 409) {
        // El stock cambió (otra venta u operador): se cierra para volver a partir del valor actual.
        await onSaved();
        setEditing(null);
        toast.error("El stock cambió mientras lo editabas. Revisalo y volvé a intentar.");
      } else {
        toast.error(
          e instanceof ApiError
            ? e.message
            : "No se pudo guardar. Podés volver a intentarlo.",
        );
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
                <TableHead className="w-[84px] text-right text-[11px] font-normal lowercase text-white/45 sm:w-[200px]">
                  En barra
                </TableHead>
                <TableHead className="w-[88px] pr-4 sm:w-[216px]">
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
                const isRenaming = renaming === item.inventoryItemId;
                const owner = unitOwners.get(item.inventoryItemId);
                const others = consumers
                  .filter((product) => product.id !== owner?.id)
                  .map((product) => product.name);
                const description = owner
                  ? ["Por unidad", ...others].join(" · ")
                  : others.length > 0
                    ? others.join(", ")
                    : "Sin productos";
                const next =
                  edit && validQuantity(quantity)
                    ? mode === "add"
                      ? new Decimal(expected).plus(decimalInput(quantity))
                      : new Decimal(decimalInput(quantity))
                    : null;
                const cancelOnEscape = (event: KeyboardEvent) => {
                  if (event.key === "Escape" && !busy) {
                    event.preventDefault();
                    setEditing(null);
                  }
                };
                return (
                  <TableRow
                    key={item.inventoryItemId}
                    id={`stock-row-${item.inventoryItemId}`}
                    className={`border-0 ${focus || edit ? "bg-[#FF9500]/10 hover:bg-[#FF9500]/10" : "hover:bg-white/[0.03]"}`}
                  >
                    <TableCell className="max-w-[420px] py-2 pl-4">
                      {isRenaming ? (
                        <input
                          autoFocus
                          aria-label={`Nuevo nombre de ${item.name}`}
                          className="bw-new-material-input"
                          maxLength={255}
                          value={renameValue}
                          disabled={itemBusy}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void rename(item);
                            }
                            if (e.key === "Escape" && !itemBusy) {
                              e.preventDefault();
                              setRenaming(null);
                            }
                          }}
                        />
                      ) : (
                        <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={`min-w-0 truncate text-[13px] font-medium sm:text-[14px] ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          {edit && mode === "add" ? (
                            <span className="bw-price-input bw-stock-cost ml-auto max-sm:mt-1 max-sm:basis-full">
                              <span>$</span>
                              <input
                                aria-label={`Costo total de la compra de ${item.name} (opcional)`}
                                inputMode="decimal"
                                placeholder="Costo (opcional)"
                                value={cost}
                                disabled={busy}
                                onChange={(e) => setCost(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void save(item);
                                  cancelOnEscape(e);
                                }}
                              />
                            </span>
                          ) : (
                            <span
                              className="hidden truncate text-[12px] text-white/40 sm:inline"
                              title={description}
                            >
                              {description}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap py-2 text-right"
                      title={`${quantityLabel(item.barCurrentStock)} unidades`}
                    >
                      {edit ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="hidden text-[12px] text-white/45 sm:inline">
                            {mode === "add" ? "+" : "Hay"}
                          </span>
                          <input
                            autoFocus
                            aria-label={
                              mode === "add"
                                ? `Unidades de ${item.name} que entran`
                                : `Unidades de ${item.name} que hay en la barra`
                            }
                            className="bw-stock-quantity"
                            inputMode="decimal"
                            placeholder={
                              mode === "add" ? "0" : stockLabel(expected)
                            }
                            value={quantity}
                            disabled={busy}
                            onChange={(e) => setQuantity(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void save(item);
                              cancelOnEscape(e);
                            }}
                          />
                          <span
                            className="hidden w-[64px] text-left text-[12px] tabular-nums text-white/45 sm:inline"
                            aria-live="polite"
                          >
                            {next ? `→ ${stockLabel(next.toString())}` : ""}
                          </span>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`text-[14px] font-medium tabular-nums ${empty ? "text-[#ffd294]" : "text-foreground"}`}
                          >
                            {stockLabel(item.barCurrentStock)}
                          </span>{" "}
                          <span className="hidden text-[12px] text-white/40 sm:inline">
                            {new Decimal(item.barCurrentStock).eq(1)
                              ? "unidad"
                              : "unidades"}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isRenaming ? (
                          <>
                            <button
                              type="button"
                              className="bw-secondary bw-table-action whitespace-nowrap"
                              aria-label={
                                itemBusy ? "Guardando…" : "Guardar nombre"
                              }
                              disabled={itemBusy || !renameValue.trim()}
                              onClick={() => void rename(item)}
                            >
                              {compactActions ? (
                                itemBusy ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Check size={14} aria-hidden="true" />
                                )
                              ) : itemBusy ? (
                                "Guardando…"
                              ) : (
                                "Guardar"
                              )}
                            </button>
                            <button
                              type="button"
                              className="bw-icon-button bw-row-menu"
                              aria-label="Cancelar cambio de nombre"
                              disabled={itemBusy}
                              onClick={() => setRenaming(null)}
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : edit ? (
                          <>
                            <button
                              type="button"
                              className="bw-primary bw-table-action whitespace-nowrap"
                              aria-label={busy ? "Guardando…" : "Guardar"}
                              disabled={busy || !quantity.trim()}
                              onClick={() => void save(item)}
                            >
                              {compactActions ? (
                                busy ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Check size={14} aria-hidden="true" />
                                )
                              ) : busy ? (
                                "Guardando…"
                              ) : (
                                "Guardar"
                              )}
                            </button>
                            <button
                              type="button"
                              className="bw-icon-button bw-row-menu"
                              aria-label="Cancelar"
                              disabled={busy}
                              onClick={() => setEditing(null)}
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            {!compactActions && (
                              <>
                                <button
                                  type="button"
                                  className="bw-secondary bw-table-action whitespace-nowrap"
                                  disabled={busy}
                                  aria-label={`Ingresar stock de ${item.name}`}
                                  onClick={() => open(item, "add")}
                                >
                                  Ingresar
                                </button>
                                <button
                                  type="button"
                                  className="bw-secondary bw-table-action whitespace-nowrap"
                                  disabled={busy}
                                  aria-label={`Contar stock de ${item.name}`}
                                  onClick={() => open(item, "count")}
                                >
                                  Contar
                                </button>
                              </>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="bw-icon-button bw-row-menu"
                                  aria-label={`Más acciones de ${item.name}`}
                                  disabled={busy || itemBusy}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="bg-[#0a0a0a]"
                              >
                                {compactActions && (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={() => open(item, "add")}
                                    >
                                      Ingresar stock
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => open(item, "count")}
                                    >
                                      Contar stock
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/[0.06]" />
                                  </>
                                )}
                                <DropdownMenuItem
                                  onSelect={() => startRename(item)}
                                >
                                  Renombrar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => setDeleting(item)}
                                >
                                  Eliminar insumo
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !itemBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent className="bar-workspace bg-[#0a0a0a]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece de tus insumos en todas las barras. Sólo se puede
              eliminar si ningún producto lo usa en su receta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={itemBusy}>Cancelar</AlertDialogCancel>
            <button
              type="button"
              className="bw-danger-button"
              disabled={itemBusy}
              onClick={() => deleting && void remove(deleting)}
            >
              {itemBusy ? "Eliminando…" : "Eliminar insumo"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
