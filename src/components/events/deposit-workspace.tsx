import { useCallback, useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useEventStock } from "@/hooks/useEventStock";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiInventoryItem } from "@/types/inventory";
import type {
  DepositMovementRow,
  DepositResponse,
} from "@/types/event-dashboard";
import { NewMaterialRow } from "./bar-new-material-row";
import { BarSwitcher } from "./bar-switcher";
import {
  decimalInput,
  normalizeSearch,
  stockLabel,
  stockLevel,
} from "./bar-workspace-model";
import { useEventNestedView } from "./event-mobile-nav";
import "./bar-workspace.css";

type Props = {
  eventId: string;
  /** En la página de evento se vuelve al listado de barras; en la vista propia no hay back. */
  onBack?: () => void;
  onChanged?: () => void;
};

type Section = "stock" | "bars";
type DepositEditor = {
  itemId: string;
  mode: "add" | "count";
  expected: string;
};
type SendEditor = {
  barId: string;
  itemId: string;
  expected: string;
  expectedBar: string;
};

const MAX_COST = /^\d{1,8}(\.\d{1,2})?$/;
/** El depósito guarda hasta seis decimales, igual que el stock de las barras. */
const validStockQuantity = (value: string) =>
  /^\d+(\.\d{1,6})?$/.test(decimalInput(value));

function formatMovementTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MovementTable({
  rows,
  emptyLabel,
}: {
  rows: DepositMovementRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-[13px] text-white/45" role="status">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-white/[0.02]">
      <Table className="table-fixed sm:table-auto">
        <TableHeader>
          <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
            <TableHead className="w-[86px] pl-4 text-[11px] font-normal lowercase text-white/45">
              Hora
            </TableHead>
            <TableHead className="text-[11px] font-normal lowercase text-white/45">
              Insumo
            </TableHead>
            <TableHead className="w-[74px] text-right text-[11px] font-normal lowercase text-white/45">
              Cantidad
            </TableHead>
            <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 sm:table-cell">
              Destino
            </TableHead>
            <TableHead className="hidden w-[120px] pr-4 text-[11px] font-normal lowercase text-white/45 md:table-cell">
              Registrado por
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
          {rows.map((row) => (
            <TableRow key={row.id} className="border-0 hover:bg-transparent">
              <TableCell className="py-2.5 pl-4 text-[12px] tabular-nums text-white/50">
                {formatMovementTime(row.createdAt)}
              </TableCell>
              <TableCell className="py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {row.itemName}
                  </span>
                  {row.type !== "SEND_TO_BAR" && (
                    <span className="bw-status hidden shrink-0 sm:inline">
                      {row.type === "DEPOSIT_IN" ? "Ingreso" : "Conteo"}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2.5 text-right text-[13px] font-medium tabular-nums text-foreground">
                {stockLabel(row.quantity)}
              </TableCell>
              <TableCell className="hidden py-2.5 text-[13px] text-white/55 sm:table-cell">
                {row.barName ?? "Depósito"}
              </TableCell>
              <TableCell className="hidden max-w-[120px] truncate py-2.5 pr-4 text-[12px] text-white/45 md:table-cell">
                {row.createdByName ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DepositWorkspace({ eventId, onBack, onChanged }: Props) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DepositResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("stock");
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "empty">("all");
  const [barQuery, setBarQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DepositEditor | null>(null);
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<SendEditor | null>(null);
  const [sendQuantity, setSendQuantity] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const load = useCallback(
    async (showSkeleton = false) => {
      if (!token) return;
      if (showSkeleton) setLoading(true);
      setError("");
      try {
        const result = await apiFetch<DepositResponse>(
          `/events/${eventId}/deposit`,
          { token },
        );
        setData(result);
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "No se pudo cargar el depósito",
        );
      } finally {
        if (showSkeleton) setLoading(false);
      }
    },
    [token, eventId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    setSection("stock");
    setSelectedBarId(null);
    setQuery("");
    setBarQuery("");
    setFilter("all");
    setEditing(null);
    setSending(null);
    setCreating(false);
  }, [eventId]);

  useEventNestedView(selectedBarId != null);

  const { eventStock, barStock } = useEventStock(
    eventId,
    null,
    token,
    Boolean(data?.tracksStock),
  );

  const eventFallback = useMemo(
    () =>
      new Map(
        (data?.items ?? []).map((item) => [
          item.inventoryItemId,
          item.eventStock,
        ]),
      ),
    [data],
  );
  const barFallback = useMemo(
    () =>
      new Map(
        (data?.barInventory ?? []).map((row) => [
          `${row.barId}:${row.inventoryItemId}`,
          row.currentStock,
        ]),
      ),
    [data],
  );

  const eventValue = useCallback(
    (itemId: string) => {
      const live = eventStock[itemId];
      return new Decimal(
        live !== undefined && Number.isFinite(live)
          ? live
          : (eventFallback.get(itemId) ?? 0),
      );
    },
    [eventStock, eventFallback],
  );
  const barValue = useCallback(
    (barId: string, itemId: string) => {
      const key = `${barId}:${itemId}`;
      const live = barStock[key];
      return new Decimal(
        live !== undefined && Number.isFinite(live)
          ? live
          : (barFallback.get(key) ?? 0),
      );
    },
    [barStock, barFallback],
  );

  const liveItems = useMemo(() => {
    if (!data) return [];
    return data.items.map((item) => {
      const total = eventValue(item.inventoryItemId);
      let inBars = new Decimal(0);
      for (const bar of data.bars) {
        inBars = inBars.plus(barValue(bar.id, item.inventoryItemId));
      }
      const available = total.minus(inBars);
      return {
        ...item,
        eventStock: total.toString(),
        inBars: inBars.toString(),
        depositStock: (available.lt(0) ? new Decimal(0) : available).toString(),
      };
    });
  }, [data, eventValue, barValue]);

  const liveBars = useMemo(() => {
    if (!data) return [];
    return data.bars.map((bar) => {
      let itemCount = 0;
      let units = new Decimal(0);
      for (const item of data.items) {
        const value = barValue(bar.id, item.inventoryItemId);
        if (value.gt(0)) {
          itemCount += 1;
          units = units.plus(value);
        }
      }
      return { ...bar, itemCount, totalUnits: units.toString() };
    });
  }, [data, barValue]);

  const totalDeposit = useMemo(
    () =>
      liveItems.reduce(
        (sum, item) => sum.plus(new Decimal(item.depositStock)),
        new Decimal(0),
      ),
    [liveItems],
  );
  const emptyDepositCount = useMemo(
    () =>
      liveItems.filter((item) => new Decimal(item.depositStock).lte(0)).length,
    [liveItems],
  );

  const filteredItems = useMemo(
    () =>
      liveItems.filter(
        (item) =>
          normalizeSearch(item.name).includes(normalizeSearch(query)) &&
          (filter !== "empty" || new Decimal(item.depositStock).lte(0)),
      ),
    [liveItems, query, filter],
  );

  const selectedBar = liveBars.find((bar) => bar.id === selectedBarId) ?? null;
  const barItemRows = useMemo(() => {
    if (!selectedBar) return [];
    return liveItems
      .map((item) => ({
        ...item,
        barStock: barValue(selectedBar.id, item.inventoryItemId).toString(),
      }))
      .filter((item) =>
        normalizeSearch(item.name).includes(normalizeSearch(barQuery)),
      )
      .sort((a, b) => new Decimal(a.barStock).cmp(new Decimal(b.barStock)));
  }, [liveItems, selectedBar, barValue, barQuery]);

  const selectedBarMovements = useMemo(
    () =>
      (data?.movements ?? []).filter(
        (movement) => movement.barId === selectedBarId,
      ),
    [data, selectedBarId],
  );

  function openDeposit(
    item: { inventoryItemId: string; depositStock: string },
    mode: "add" | "count",
  ) {
    setCreating(false);
    setEditing({
      itemId: item.inventoryItemId,
      mode,
      expected: item.depositStock,
    });
    setQuantity("");
    setCost("");
  }

  function openSend(item: {
    inventoryItemId: string;
    depositStock: string;
    barStock: string;
  }) {
    if (!selectedBarId) return;
    setSending({
      itemId: item.inventoryItemId,
      barId: selectedBarId,
      expected: item.depositStock,
      expectedBar: item.barStock,
    });
    setSendQuantity("");
  }

  async function saveDeposit(itemId: string) {
    const editor = editing;
    if (!token || busy || !editor || editor.itemId !== itemId || !data) return;
    const amount = decimalInput(quantity);
    if (
      !validStockQuantity(amount) ||
      (editor.mode === "add" && new Decimal(amount).lte(0))
    ) {
      toast.error(
        editor.mode === "add"
          ? "Ingresá una cantidad mayor a cero."
          : "Ingresá el conteo actual, con hasta seis decimales.",
      );
      return;
    }
    if (editor.mode === "add" && cost.trim() && !MAX_COST.test(decimalInput(cost))) {
      toast.error("Revisá el costo: usá hasta dos decimales.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/events/${eventId}/deposit/stock`, {
        method: "POST",
        token,
        body: JSON.stringify({
          inventoryItemId: itemId,
          mode: editor.mode,
          quantity: amount,
          expectedDepositStock: editor.expected,
          ...(editor.mode === "add" && cost.trim()
            ? { totalCost: decimalInput(cost) }
            : {}),
        }),
      });
      await load();
      onChanged?.();
      setEditing(null);
      const item = liveItems.find(
        (row) => row.inventoryItemId === editor.itemId,
      );
      toast.success(
        editor.mode === "add"
          ? `${stockLabel(amount)} ${item?.name ?? "unidades"} en el depósito`
          : `Conteo de ${item?.name ?? "insumo"}: ${stockLabel(amount)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load();
        setEditing(null);
        toast.error(
          "El depósito cambió mientras lo editabas. Revisá el saldo y volvé a intentar.",
        );
      } else {
        toast.error(
          e instanceof ApiError
            ? e.message
            : "No se pudo guardar. Volvé a intentarlo.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveSend() {
    const editor = sending;
    if (!token || sendBusy || !editor || !data) return;
    const amount = decimalInput(sendQuantity);
    if (!validStockQuantity(amount) || new Decimal(amount).lte(0)) {
      toast.error("Ingresá una cantidad mayor a cero.");
      return;
    }
    setSendBusy(true);
    try {
      await apiFetch(`/events/${eventId}/deposit/transfers`, {
        method: "POST",
        token,
        body: JSON.stringify({
          inventoryItemId: editor.itemId,
          barId: editor.barId,
          quantity: amount,
          expectedDepositStock: editor.expected,
          expectedBarStock: editor.expectedBar,
        }),
      });
      await load();
      onChanged?.();
      setSending(null);
      const item = liveItems.find(
        (row) => row.inventoryItemId === editor.itemId,
      );
      const bar = liveBars.find((row) => row.id === editor.barId);
      toast.success(
        `${stockLabel(amount)} ${item?.name ?? "unidades"} → ${bar?.name ?? "barra"}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load();
        setSending(null);
        toast.error(
          "El stock cambió mientras enviabas. Revisá el depósito y volvé a intentar.",
        );
      } else {
        toast.error(
          e instanceof ApiError
            ? e.message
            : "No se pudo registrar el envío. Volvé a intentarlo.",
        );
      }
    } finally {
      setSendBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bar-workspace">
        <div className="bw-skeleton" aria-label="Cargando depósito" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bar-workspace">
        <div role="alert" className="bw-error">
          {error || "No se pudo cargar el depósito"}
          <button
            className="bw-secondary"
            onClick={() => {
              setLoading(true);
              void load(true);
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bar-workspace">
      <div className="bw-detail">
        {onBack ? (
          <button className="bw-back" onClick={onBack}>
            <ArrowLeft size={16} />
            Todas las barras
          </button>
        ) : null}
        <header className="bw-detail-header">
          <div className="bw-grow">
            <div className="bw-bar-title">
              <h3>Depósito</h3>
            </div>
            <div className="bw-detail-meta">
              {data.tracksStock ? (
                <span className="bw-live-state">
                  <span />
                  Stock en vivo
                </span>
              ) : (
                <span className="bw-live-state inactive">
                  <span />
                  Sin control de stock
                </span>
              )}
              <span className="bw-detail-sales">
                Disponible <strong>{stockLabel(totalDeposit.toString())}</strong>{" "}
                unidades
              </span>
            </div>
          </div>
        </header>

        {!data.tracksStock ? (
          <div className="bw-error" role="status">
            Este evento no usa control de stock. Cambiá el modo de operación para
            cargar existencias.
          </div>
        ) : null}

        <nav className="bw-nav" aria-label="Secciones del depósito">
          <button
            aria-current={section === "stock" ? "page" : undefined}
            onClick={() => {
              setSection("stock");
              setSelectedBarId(null);
            }}
          >
            Existencias
            <span>{liveItems.length}</span>
          </button>
          <button
            aria-current={section === "bars" ? "page" : undefined}
            onClick={() => setSection("bars")}
          >
            Barras
            <span>{liveBars.length}</span>
          </button>
        </nav>

        {section === "bars" && liveBars.length > 0 ? (
          <div className="bw-bar-switcher">
            <button
              type="button"
              className="bw-switcher-back"
              aria-current={selectedBarId == null ? "page" : undefined}
              onClick={() => {
                setSelectedBarId(null);
                setSending(null);
                setBarQuery("");
              }}
            >
              Resumen
            </button>
            <BarSwitcher
              bars={liveBars}
              activeBarId={selectedBarId}
              onSelect={(barId) => {
                setSelectedBarId(barId);
                setSending(null);
                setBarQuery("");
              }}
            />
          </div>
        ) : null}

        {section === "stock" ? (
          <section aria-label="Existencias del depósito">
            <div className="bw-tab-head">
              <p className="bw-lede">
                {liveItems.length}{" "}
                {liveItems.length === 1 ? "insumo" : "insumos"}
                {emptyDepositCount > 0 && (
                  <span className="bw-lede-warning">
                    {" "}
                    · {emptyDepositCount}{" "}
                    {emptyDepositCount === 1 ? "sin stock" : "sin stock"}
                  </span>
                )}
              </p>
              {data.tracksStock ? (
                <button
                  className="bw-secondary"
                  onClick={() => {
                    setEditing(null);
                    setQuery("");
                    setFilter("all");
                    setCreating(true);
                  }}
                  disabled={busy || creating}
                >
                  <Plus size={17} />
                  Nuevo insumo
                </button>
              ) : null}
            </div>

            {liveItems.length > 0 && (
              <div className="bw-toolbar">
                <label className="bw-search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar insumo en el depósito"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar insumo"
                  />
                </label>
                <div
                  className="bw-segmented"
                  role="group"
                  aria-label="Filtrar depósito"
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
                    Sin stock{emptyDepositCount > 0 && <span>{emptyDepositCount}</span>}
                  </button>
                </div>
              </div>
            )}

            {liveItems.length === 0 && !creating ? (
              <div className="bw-empty">
                <Package size={30} />
                <h4>El depósito todavía está vacío</h4>
                <p>
                  Creá un insumo o cargá existencias para después repartirlas
                  entre las barras del evento.
                </p>
              </div>
            ) : filteredItems.length === 0 && !creating ? (
              <div className="bw-empty">
                <h4>No hay insumos con este filtro</h4>
                <button
                  className="bw-secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Ver todo el depósito
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
                <Table className="table-fixed sm:table-auto">
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                      <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                        Insumo
                      </TableHead>
                      <TableHead className="w-[92px] text-right text-[11px] font-normal lowercase text-white/45">
                        En depósito
                      </TableHead>
                      <TableHead className="w-[150px] pr-4">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                    {creating && (
                      <NewMaterialRow
                        token={token}
                        materials={data.items.map(
                          (item): ApiInventoryItem => ({
                            id: item.inventoryItemId,
                            name: item.name,
                            createdAt: item.createdAt,
                          }),
                        )}
                        middleCells={1}
                        onCancel={() => setCreating(false)}
                        onCreated={() => {
                          setCreating(false);
                          void load();
                        }}
                      />
                    )}
                    {filteredItems.map((item) => {
                      const edit =
                        editing?.itemId === item.inventoryItemId
                          ? editing
                          : null;
                      return (
                        <TableRow
                          key={item.inventoryItemId}
                          className={`border-0 ${edit ? "bg-[#FF9500]/10 hover:bg-[#FF9500]/10" : "hover:bg-white/[0.03]"}`}
                        >
                          <TableCell className="max-w-[420px] py-2 pl-4">
                            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">
                              <span
                                className={`min-w-0 truncate text-[13px] font-medium sm:text-[14px] ${new Decimal(item.depositStock).lte(0) ? "text-[#ffd294]" : "text-foreground"}`}
                                title={item.name}
                              >
                                {item.name}
                              </span>
                              {edit ? (
                                edit.mode === "add" ? (
                                  <span className="bw-price-input bw-stock-cost ml-auto max-sm:mt-1 max-sm:basis-full">
                                    <span>$</span>
                                    <input
                                      aria-label={`Costo total de la compra de ${item.name} (opcional)`}
                                      inputMode="decimal"
                                      placeholder="Costo (opcional)"
                                      value={cost}
                                      disabled={busy}
                                      onChange={(event) => setCost(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter")
                                          void saveDeposit(item.inventoryItemId);
                                        if (event.key === "Escape" && !busy)
                                          setEditing(null);
                                      }}
                                    />
                                  </span>
                                ) : null
                              ) : (
                                <span className="hidden truncate text-[12px] text-white/40 sm:inline">
                                  En barras: {stockLabel(item.inBars)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap py-2 text-right"
                            title={`${stockLabel(item.depositStock)} unidades`}
                          >
                            {edit ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="hidden text-[12px] text-white/45 sm:inline">
                                  {edit.mode === "add" ? "+" : "Hay"}
                                </span>
                                <input
                                  autoFocus
                                  aria-label={
                                    edit.mode === "add"
                                      ? `Unidades de ${item.name} que entran al depósito`
                                      : `Unidades de ${item.name} que hay en el depósito`
                                  }
                                  className="bw-stock-quantity"
                                  inputMode="decimal"
                                  placeholder={stockLabel(item.depositStock)}
                                  value={quantity}
                                  disabled={busy}
                                  onChange={(event) => setQuantity(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter")
                                      void saveDeposit(item.inventoryItemId);
                                    if (event.key === "Escape" && !busy)
                                      setEditing(null);
                                  }}
                                />
                              </div>
                            ) : (
                              <>
                                <span
                                  className={`text-[14px] font-medium tabular-nums ${new Decimal(item.depositStock).lte(0) ? "text-[#ffd294]" : "text-foreground"}`}
                                >
                                  {stockLabel(item.depositStock)}
                                </span>{" "}
                                <span className="hidden text-[12px] text-white/40 sm:inline">
                                  {new Decimal(item.depositStock).eq(1)
                                    ? "unidad"
                                    : "unidades"}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="py-2 pr-4 text-right">
                            {edit ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="bw-primary bw-table-action whitespace-nowrap"
                                  aria-label={busy ? "Guardando…" : "Guardar"}
                                  disabled={busy || !quantity.trim()}
                                  onClick={() => void saveDeposit(item.inventoryItemId)}
                                >
                                  {busy ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Check size={14} aria-hidden="true" />
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
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="bw-secondary bw-table-action whitespace-nowrap"
                                  disabled={busy || !data.tracksStock}
                                  aria-label={`Ingresar stock de ${item.name} al depósito`}
                                  onClick={() => openDeposit(item, "add")}
                                >
                                  Ingresar
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="bw-icon-button bw-row-menu"
                                      aria-label={`Más acciones de ${item.name}`}
                                      disabled={busy}
                                    >
                                      <MoreHorizontal size={16} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="bg-[#0a0a0a]"
                                  >
                                    <DropdownMenuItem
                                      onSelect={() => openDeposit(item, "count")}
                                    >
                                      Contar stock
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        ) : selectedBar ? (
          <section aria-label={`Stock de ${selectedBar.name}`}>
            <div className="bw-detail-header">
              <div className="bw-grow">
                <div className="bw-bar-title">
                  <h3>{selectedBar.name}</h3>
                </div>
                <div className="bw-detail-meta">
                  <span
                    className={`bw-live-state ${selectedBar.isActive ? "" : "inactive"}`}
                  >
                    <span />
                    {selectedBar.isActive ? "Stock en vivo" : "Barra inactiva"}
                  </span>
                  <span className="bw-detail-sales">
                    {selectedBar.itemCount}{" "}
                    {selectedBar.itemCount === 1 ? "insumo" : "insumos"} ·{" "}
                    <strong>{stockLabel(selectedBar.totalUnits)}</strong> unidades
                  </span>
                </div>
              </div>
            </div>

            <div className="bw-toolbar">
              <label className="bw-search">
                <Search size={17} />
                <input
                  aria-label="Buscar insumo en la barra"
                  value={barQuery}
                  onChange={(event) => setBarQuery(event.target.value)}
                  placeholder="Buscar insumo"
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
              <Table className="table-fixed sm:table-auto">
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                      Insumo
                    </TableHead>
                    <TableHead className="w-[84px] text-right text-[11px] font-normal lowercase text-white/45">
                      En barra
                    </TableHead>
                    <TableHead className="hidden w-[92px] text-right text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                      En depósito
                    </TableHead>
                    <TableHead className="w-[92px] pr-4">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                  {barItemRows.length === 0 && (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={4}
                        className="py-8 pl-4 text-[13px] text-white/45"
                      >
                        {barQuery
                          ? "No hay insumos con esa búsqueda."
                          : "No hay insumos activos en el catálogo."}
                      </TableCell>
                    </TableRow>
                  )}
                  {barItemRows.map((item) => {
                    const level = stockLevel(item.barStock);
                    const send =
                      sending?.itemId === item.inventoryItemId &&
                      sending.barId === selectedBar.id
                        ? sending
                        : null;
                    return (
                      <TableRow
                        key={item.inventoryItemId}
                        className={`border-0 ${send ? "bg-[#FF9500]/10 hover:bg-[#FF9500]/10" : "hover:bg-white/[0.03]"}`}
                      >
                        <TableCell className="max-w-[380px] py-2 pl-4">
                          <span
                            className={`block truncate text-[13px] font-medium sm:text-[14px] ${level === "empty" ? "text-rose-200" : level === "low" ? "text-[#ffd294]" : "text-foreground"}`}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2 text-right">
                          {send ? (
                            <input
                              autoFocus
                              aria-label={`Unidades de ${item.name} que se envían a ${selectedBar.name}`}
                              className="bw-stock-quantity"
                              inputMode="decimal"
                              placeholder="0"
                              value={sendQuantity}
                              disabled={sendBusy}
                              onChange={(event) =>
                                setSendQuantity(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveSend();
                                if (event.key === "Escape" && !sendBusy)
                                  setSending(null);
                              }}
                            />
                          ) : (
                            <span className={`bw-stock-value ${level}`}>
                              {stockLabel(item.barStock)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden py-2 text-right text-[13px] tabular-nums text-white/55 sm:table-cell">
                          {stockLabel(item.depositStock)}
                        </TableCell>
                        <TableCell className="py-2 pr-4 text-right">
                          {send ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="bw-primary bw-table-action whitespace-nowrap"
                                aria-label={sendBusy ? "Enviando…" : "Enviar"}
                                disabled={sendBusy || !sendQuantity.trim()}
                                onClick={() => void saveSend()}
                              >
                                {sendBusy ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Check size={14} aria-hidden="true" />
                                )}
                              </button>
                              <button
                                type="button"
                                className="bw-icon-button bw-row-menu"
                                aria-label="Cancelar envío"
                                disabled={sendBusy}
                                onClick={() => setSending(null)}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="bw-secondary bw-table-action whitespace-nowrap"
                              aria-label={`Enviar ${item.name} a ${selectedBar.name}`}
                              disabled={
                                sendBusy ||
                                !data.tracksStock ||
                                new Decimal(item.depositStock).lte(0)
                              }
                              title={
                                new Decimal(item.depositStock).lte(0)
                                  ? "No hay stock en el depósito"
                                  : undefined
                              }
                              onClick={() => openSend(item)}
                            >
                              <Send size={13} aria-hidden="true" />
                              Enviar
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="bw-team-section">
              <div className="bw-team-section-head">
                <div>
                  <h4>Envíos registrados</h4>
                  <p>Movimientos de esta barra durante el evento.</p>
                </div>
              </div>
              <MovementTable
                rows={selectedBarMovements.slice(0, 30)}
                emptyLabel="Todavía no enviaste insumos a esta barra."
              />
            </div>
          </section>
        ) : (
          <section aria-label="Barras del evento">
            <div className="bw-tab-head">
              <p className="bw-lede">
                {liveBars.length}{" "}
                {liveBars.length === 1 ? "barra" : "barras"} · stock en vivo
              </p>
            </div>
            {liveBars.length === 0 ? (
              <div className="bw-empty">
                <Package size={30} />
                <h4>El evento todavía no tiene barras</h4>
                <p>
                  Creá las barras desde la pestaña Barra para poder enviarles
                  insumos desde el depósito.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
                <Table className="table-fixed sm:table-auto">
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                      <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                        Barra
                      </TableHead>
                      <TableHead className="hidden w-[90px] text-right text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                        Insumos
                      </TableHead>
                      <TableHead className="w-[92px] text-right text-[11px] font-normal lowercase text-white/45">
                        Unidades
                      </TableHead>
                      <TableHead className="hidden w-[96px] text-right text-[11px] font-normal lowercase text-white/45 md:table-cell">
                        Último envío
                      </TableHead>
                      <TableHead className="w-10 pr-4">
                        <span className="sr-only">Abrir barra</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                    {liveBars.map((bar) => (
                      <TableRow
                        key={bar.id}
                        tabIndex={0}
                        aria-label={`Abrir ${bar.name}`}
                        onClick={() => {
                          setSelectedBarId(bar.id);
                          setBarQuery("");
                          setSending(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedBarId(bar.id);
                            setBarQuery("");
                          }
                        }}
                        className="cursor-pointer border-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-[#ff9500] focus-visible:-outline-offset-2"
                      >
                        <TableCell className="py-3.5 pl-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-medium text-foreground">
                              {bar.name}
                            </span>
                            {!bar.isActive && (
                              <span className="bw-status">Inactiva</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-right text-[13px] tabular-nums text-white/55 sm:table-cell">
                          {bar.itemCount}
                        </TableCell>
                        <TableCell className="py-3.5 text-right text-[14px] font-medium tabular-nums text-foreground">
                          {stockLabel(bar.totalUnits)}
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-right text-[12px] tabular-nums text-white/45 md:table-cell">
                          {formatMovementTime(bar.lastMovementAt)}
                        </TableCell>
                        <TableCell className="py-3.5 pr-4">
                          <ArrowRight
                            size={18}
                            className="ml-auto text-white/30"
                            aria-hidden="true"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="bw-team-section">
              <div className="bw-team-section-head">
                <div>
                  <h4>Movimientos recientes</h4>
                  <p>Ingresos, conteos y envíos del depósito.</p>
                </div>
              </div>
              <MovementTable
                rows={(data.movements ?? []).slice(0, 30)}
                emptyLabel="Todavía no hay movimientos registrados."
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
