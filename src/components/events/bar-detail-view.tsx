import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useEventStock } from "@/hooks/useEventStock";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  ApiInventoryItem,
  ApiProduct,
  ProductSaleType,
} from "@/types/inventory";
import type {
  BarInventoryApiResponse,
  BarInventoryItemRow,
  BarMenuProductRow,
  BarMenuProductsApiResponse,
  EventAssignmentStaffRow,
  EventBarRow,
  EventBarsResponse,
  EventStaffListResponse,
} from "@/types/event-dashboard";
import { BarMenuPanel } from "./bar-menu-panel";
import { BarTeamPanel } from "./bar-team-panel";
import { BarSalesPanel } from "./bar-sales-panel";
import { BarProductEditor } from "./bar-product-editor";
import { BarSwitcher } from "./bar-switcher";
import {
  recipeLinesForApi,
  type RecipeDraftLine,
  type RecipeMode,
  moneyLabel,
  saleTypeLabel,
} from "./bar-workspace-model";
type Props = {
  eventId: string;
  barId: string;
  trackStock?: boolean;
  onSelectBar: (barId: string) => void;
  onBack: () => void;
  onChanged?: () => void;
};
type Section = "menu" | "team" | "sales";

export function BarDetailView({
  eventId,
  barId,
  trackStock = true,
  onSelectBar,
  onBack,
  onChanged,
}: Props) {
  const token = useAuthStore((s) => s.token);
  const [bars, setBars] = useState<EventBarRow[]>([]);
  const [menu, setMenu] = useState<BarMenuProductRow[]>([]);
  const [catalog, setCatalog] = useState<ApiProduct[]>([]);
  const [materials, setMaterials] = useState<ApiInventoryItem[]>([]);
  const [inventory, setInventory] = useState<BarInventoryItemRow[]>([]);
  const [staff, setStaff] = useState<EventAssignmentStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("menu");
  const [editing, setEditing] = useState<ApiProduct | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState("");
  const [menuQuery, setMenuQuery] = useState("");
  const [pendingSaleType, setPendingSaleType] = useState<{
    product: ApiProduct;
    saleType: ProductSaleType;
  } | null>(null);
  const { barStock } = useEventStock(eventId, barId, token, trackStock);
  const bar = bars.find((row) => row.id === barId);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const requestId = ++requestIdRef.current;
    try {
      const [barsRes, menuRes, productsRes, materialsRes, stockRes, staffRes] =
        await Promise.all([
          apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, { token }),
          apiFetch<BarMenuProductsApiResponse>(
            `/bars/${barId}/products?eventId=${eventId}`,
            { token },
          ),
          apiFetch<{ products: ApiProduct[] }>("/inventory/products", {
            token,
          }),
          trackStock
            ? apiFetch<{ items: ApiInventoryItem[] }>("/inventory/items", {
                token,
              })
            : Promise.resolve({ items: [] }),
          trackStock
            ? apiFetch<BarInventoryApiResponse>(`/bars/${barId}/inventory`, {
                token,
              })
            : Promise.resolve({ items: [] }),
          apiFetch<EventStaffListResponse>(`/events/${eventId}/staff`, {
            token,
          }),
        ]);
      if (requestId !== requestIdRef.current) return;
      setBars(barsRes.bars);
      setMenu(menuRes.products);
      setCatalog(productsRes.products);
      setMaterials(materialsRes.items);
      setInventory(stockRes.items);
      setStaff(staffRes.staff);
      setError("");
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(
        e instanceof ApiError ? e.message : "No se pudo cargar la barra",
      );
      throw e;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [token, eventId, barId, trackStock]);

  // Al cambiar de barra se conserva la sección activa, pero se cierran editores y filtros
  // para no mostrar datos del puesto anterior.
  useEffect(() => {
    setEditing(undefined);
    setRename(false);
    setMenuQuery("");
    setPendingSaleType(null);
    setBusy(null);
    setError("");
    setMenu([]);
    setInventory([]);
    setLoading(true);
  }, [barId]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  useEffect(() => {
    setInventory((prev) =>
      prev.map((item) => {
        const current = barStock[`${barId}:${item.inventoryItemId}`];
        return current === undefined
          ? item
          : { ...item, barCurrentStock: String(current) };
      }),
    );
  }, [barStock, barId]);

  useEffect(() => {
    if (!token || !trackStock) return;
    const interval = setInterval(() => {
      void apiFetch<BarMenuProductsApiResponse>(
        `/bars/${barId}/products?eventId=${eventId}`,
        { token },
      )
        .then((result) => setMenu(result.products))
        .catch(() => {});
    }, 25000);
    return () => clearInterval(interval);
  }, [token, trackStock, barId, eventId]);

  async function refresh() {
    await load();
    onChanged?.();
  }
  async function toggleProduct(productId: string, active: boolean) {
    if (!token || busy) return false;
    setBusy(productId);
    try {
      await apiFetch(`/bars/${barId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId, isActive: active }),
      });
      await refresh();
      toast.success(
        active
          ? "Producto agregado a esta barra"
          : "Producto quitado de esta barra",
      );
      return true;
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el menú",
      );
      return false;
    } finally {
      setBusy(null);
    }
  }
  async function updateBar(patch: { name?: string; isActive?: boolean }) {
    if (!token || busy) return;
    setBusy("bar");
    try {
      await apiFetch(`/events/${eventId}/bars/${barId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(patch),
      });
      await refresh();
      setRename(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar la barra",
      );
    } finally {
      setBusy(null);
    }
  }
  function materialCreated(item: ApiInventoryItem) {
    setMaterials((prev) => [item, ...prev.filter((row) => row.id !== item.id)]);
    setInventory((prev) =>
      prev.some((row) => row.inventoryItemId === item.id)
        ? prev.map((row) =>
            row.inventoryItemId === item.id ? { ...row, name: item.name } : row,
          )
        : [
            {
              inventoryItemId: item.id,
              name: item.name,
              createdAt: item.createdAt,
              barCurrentStock: "0",
              barInventoryRowId: null,
              eventStockAllocated: "0",
              unallocatedEventStock: "0",
            },
            ...prev,
          ],
    );
  }
  async function changeSaleType(productId: string, saleType: ProductSaleType) {
    if (!token || busy) return;
    setBusy(productId);
    try {
      await apiFetch(`/inventory/products/${productId}/sale-type`, {
        method: "PUT",
        token,
        body: JSON.stringify({ saleType }),
      });
      await refresh();
      toast.success(`Ahora se vende como ${saleTypeLabel(saleType)}`);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo cambiar la venta",
      );
    } finally {
      setBusy(null);
    }
  }
  function requestSaleType(productId: string, saleType: ProductSaleType) {
    const product = catalog.find((row) => row.id === productId);
    if (!product) return;
    // Cambiar de modo descarta la receta: se confirma sólo si había una.
    if (product.recipes.length > 0) setPendingSaleType({ product, saleType });
    else void changeSaleType(productId, saleType);
  }
  async function saveRecipe(
    productId: string,
    mode: RecipeMode,
    lines: RecipeDraftLine[],
  ) {
    if (!token) return false;
    try {
      await apiFetch(`/inventory/products/${productId}/recipe`, {
        method: "PUT",
        token,
        body: JSON.stringify({ recipes: recipeLinesForApi(mode, lines) }),
      });
      await refresh();
      toast.success(
        mode === "GLASS" ? "Receta guardada" : "Botellas guardadas",
      );
      return true;
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo guardar la receta",
      );
      return false;
    }
  }
  const activeIds = new Set(
    menu.filter((row) => row.isActiveForBar).map((row) => row.id),
  );
  const members = staff.filter(
    (member) => member.barId === barId && member.isAssigned,
  ).length;

  return (
    <div className="bw-detail">
      {editing === undefined ? (
        bars.length > 0 ? (
          <div className="bw-bar-switcher">
            <button
              type="button"
              className="bw-switcher-back"
              onClick={onBack}
              aria-label="Volver a todas las barras"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Todas</span>
            </button>
            <BarSwitcher
              bars={bars}
              activeBarId={barId}
              onSelect={onSelectBar}
            />
          </div>
        ) : (
          <button className="bw-back" onClick={onBack}>
            <ArrowLeft size={16} />
            Todas las barras
          </button>
        )
      ) : null}
      {loading ? (
        <div className="bw-skeleton" aria-label="Cargando barra" aria-busy="true" />
      ) : error ? (
        <div role="alert" className="bw-error">
          {error}
          <button
            className="bw-secondary"
            onClick={() => {
              setLoading(true);
              void load().catch(() => {});
            }}
          >
            Reintentar
          </button>
        </div>
      ) : !bar ? (
        <div className="bw-empty">
          <h3>Esta barra ya no está disponible</h3>
        </div>
      ) : (
        <>
          <header className="bw-detail-header">
            <div className="bw-grow">
              {rename ? (
                <form
                  className="bw-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void updateBar({ name: name.trim() });
                  }}
                >
                  <input
                    aria-label="Nombre de la barra"
                    autoFocus
                    maxLength={100}
                    value={name}
                    disabled={busy !== null}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button
                    className="bw-icon-button"
                    aria-label="Guardar nombre"
                    disabled={busy !== null || !name.trim()}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    className="bw-icon-button"
                    aria-label="Cancelar cambio de nombre"
                    disabled={busy !== null}
                    onClick={() => setRename(false)}
                  >
                    <X size={18} />
                  </button>
                </form>
              ) : (
                <div className="bw-bar-title">
                  <h3>{bar.name}</h3>
                  <button
                    className="bw-icon-button"
                    aria-label="Renombrar barra"
                    onClick={() => {
                      setName(bar.name);
                      setRename(true);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
              <div className="bw-detail-meta">
                <span
                  className={`bw-live-state ${bar.isActive === false ? "inactive" : ""}`}
                >
                  <span />
                  {bar.isActive === false ? "Barra inactiva" : "Barra activa"}
                </span>
                <span className="bw-detail-sales">
                  Vendido <strong>{moneyLabel(bar.totalSales ?? "0")}</strong>
                </span>
              </div>
            </div>
            {!bar.isDefault && (
              <button
                className="bw-quiet-button"
                disabled={busy !== null}
                onClick={() =>
                  void updateBar({ isActive: bar.isActive === false })
                }
              >
                {bar.isActive === false ? "Activar barra" : "Desactivar barra"}
              </button>
            )}
          </header>
          <nav className="bw-nav" aria-label="Secciones de la barra">
            {(
              [
                { id: "menu", label: "Menú", count: activeIds.size },
                { id: "team", label: "Equipo", count: members },
                { id: "sales", label: "Ventas" },
              ] as { id: Section; label: string; count?: number }[]
            ).map((item) => (
              <button
                key={item.id}
                aria-current={section === item.id ? "page" : undefined}
                disabled={editing !== undefined || busy !== null}
                onClick={() => setSection(item.id)}
              >
                {item.label}
                {item.count != null && <span>{item.count}</span>}
              </button>
            ))}
          </nav>
          <div
            className="bw-section"
            role="region"
            aria-label={
              section === "menu"
                ? "Menú"
                : section === "team"
                  ? "Equipo"
                  : "Ventas"
            }
          >
            {section === "menu" &&
              (editing !== undefined ? (
                <BarProductEditor
                  key={editing?.id ?? "new"}
                  token={token}
                  eventId={eventId}
                  barId={barId}
                  directStock={
                    editing
                      ? menu.find((row) => row.id === editing.id)?.directStock
                      : null
                  }
                  product={editing}
                  price={
                    editing
                      ? menu.find((row) => row.id === editing.id)?.price
                      : undefined
                  }
                  trackStock={trackStock}
                  materials={materials}
                  onMaterialsChange={materialCreated}
                  onCancel={() => setEditing(undefined)}
                  onRemove={editing ? () => toggleProduct(editing.id, false) : undefined}
                  onDeleted={() => {
                    setEditing(undefined);
                    void refresh().catch(() => {});
                    toast.success("Producto eliminado");
                  }}
                  onSaved={() => {
                    setEditing(undefined);
                    void refresh().catch(() => {});
                    toast.success("Producto guardado en el menú de esta barra");
                  }}
                />
              ) : (
                <BarMenuPanel
                  token={token}
                  eventId={eventId}
                  barId={barId}
                  bars={bars}
                  catalog={catalog}
                  menu={menu}
                  inventory={inventory}
                  materials={materials}
                  trackStock={trackStock}
                  busy={busy}
                  onToggle={(id, active) => void toggleProduct(id, active)}
                  onCreate={() => setEditing(null)}
                  onEdit={setEditing}
                  onSaleTypeChange={requestSaleType}
                  onSaveRecipe={saveRecipe}
                  onMaterialCreated={materialCreated}
                  query={menuQuery}
                  onQueryChange={setMenuQuery}
                />
              ))}
            {section === "team" && (
              <BarTeamPanel
                token={token}
                eventId={eventId}
                barId={barId}
                staff={staff}
                bars={bars}
                onSaved={refresh}
              />
            )}
            {section === "sales" && (
              <BarSalesPanel
                token={token}
                eventId={eventId}
                barId={barId}
                total={bar.totalSales ?? "0"}
              />
            )}
          </div>
        </>
      )}
      <AlertDialog
        open={pendingSaleType !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSaleType(null);
        }}
      >
        <AlertDialogContent className="bar-workspace bg-[#0a0a0a]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Vender {pendingSaleType?.product.name} como{" "}
              {pendingSaleType ? saleTypeLabel(pendingSaleType.saleType) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se descarta su configuración actual
              {pendingSaleType?.product.recipes.length
                ? ` (${pendingSaleType.product.recipes.map((line) => line.inventoryItemName).join(" + ")})`
                : ""}
              . El cambio aplica al producto en todas las barras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <button
              type="button"
              className="bw-primary"
              onClick={() => {
                const pending = pendingSaleType;
                setPendingSaleType(null);
                if (pending)
                  void changeSaleType(pending.product.id, pending.saleType);
              }}
            >
              Cambiar venta
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
