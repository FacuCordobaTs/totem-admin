import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import { AlertTriangle, ArrowLeft, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useEventStock } from "@/hooks/useEventStock";
import type { ApiProduct } from "@/components/inventory/recipe-config";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
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
import { BarStockPanel } from "./bar-stock-panel";
import { BarTeamPanel } from "./bar-team-panel";
import { BarSalesPanel } from "./bar-sales-panel";
import { BarProductEditor } from "./bar-product-editor";
import { moneyLabel } from "./bar-workspace-model";
type Props = {
  eventId: string;
  barId: string;
  trackStock?: boolean;
  onBack: () => void;
  onChanged?: () => void;
};
type Section = "menu" | "stock" | "team" | "sales";

export function BarDetailView({
  eventId,
  barId,
  trackStock = true,
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
  const { barStock } = useEventStock(eventId, barId, token, trackStock);
  const bar = bars.find((row) => row.id === barId);

  const load = useCallback(async () => {
    if (!token) return;
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
      setBars(barsRes.bars);
      setMenu(menuRes.products);
      setCatalog(productsRes.products);
      setMaterials(materialsRes.items);
      setInventory(
        stockRes.items.map((item) => ({
          ...item,
          countingUnit:
            materialsRes.items.find(
              (material) => material.id === item.inventoryItemId,
            )?.countingUnit ?? item.countingUnit,
        })),
      );
      setStaff(staffRes.staff);
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo cargar la barra",
      );
      throw e;
    } finally {
      setLoading(false);
    }
  }, [token, eventId, barId, trackStock]);
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
    setCatalog((prev) =>
      prev.map((product) => ({
        ...product,
        recipes: product.recipes.map((line) =>
          line.inventoryItemId === item.id
            ? { ...line, inventoryItemName: item.name }
            : line,
        ),
      })),
    );
    setMaterials((prev) => [...prev.filter((row) => row.id !== item.id), item]);
    setInventory((prev) =>
      prev.some((row) => row.inventoryItemId === item.id)
        ? prev.map((row) =>
            row.inventoryItemId === item.id
              ? { ...row, name: item.name, countingUnit: item.countingUnit }
              : row,
          )
        : [
            ...prev,
            {
              inventoryItemId: item.id,
              name: item.name,
              baseUnit: item.baseUnit,
              packageSize: item.packageSize,
              countingUnit: item.countingUnit,
              barCurrentStock: "0",
              barInventoryRowId: null,
              eventStockAllocated: "0",
              unallocatedEventStock: "0",
            },
          ],
    );
  }
  const activeIds = new Set(
    menu.filter((row) => row.isActiveForBar).map((row) => row.id),
  );
  const activeProducts = catalog.filter((product) => activeIds.has(product.id));
  // El contador de Stock cuenta existencias agotadas, no productos: es el mismo
  // número que ve el operador en esa pestaña.
  const emptyStock = trackStock
    ? inventory.filter((item) => new Decimal(item.barCurrentStock).lte(0))
        .length +
      menu.filter((row) => {
        const product = catalog.find((item) => item.id === row.id);
        return (
          product?.recipes.length === 0 &&
          row.directStock != null &&
          new Decimal(row.directStock).lte(0)
        );
      }).length
    : 0;
  const members = staff.filter(
    (member) => member.barId === barId && member.isAssigned,
  ).length;

  return (
    <div className="bw-detail">
      <button className="bw-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Todas las barras
      </button>
      {loading ? (
        <div className="bw-skeleton" aria-label="Cargando barra" />
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
                ...(trackStock
                  ? [
                      {
                        id: "stock",
                        label: "Stock",
                        count: emptyStock || undefined,
                      },
                    ]
                  : []),
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
                {item.count != null && (
                  <span
                    className={
                      item.id === "stock" && emptyStock ? "warning" : ""
                    }
                    title={
                      item.id === "stock"
                        ? `${emptyStock} ${emptyStock === 1 ? "existencia sin stock" : "existencias sin stock"}`
                        : undefined
                    }
                  >
                    {item.id === "stock" && emptyStock > 0 && (
                      <AlertTriangle
                        size={12}
                        aria-label="Existencias sin stock"
                      />
                    )}
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div
            className="bw-section"
            role="region"
            aria-label={
              section === "menu"
                ? "Menú"
                : section === "stock"
                  ? "Stock"
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
                  onSaved={(_id, hasStock) => {
                    const created = editing === null;
                    setEditing(undefined);
                    void refresh()
                      .then(() => {
                        if (created && hasStock) setSection("stock");
                      })
                      .catch(() => {});
                    toast.success("Producto guardado en el menú de esta barra");
                  }}
                />
              ) : (
                <BarMenuPanel
                  catalog={catalog}
                  menu={menu}
                  inventory={inventory}
                  trackStock={trackStock}
                  busy={busy}
                  onToggle={(id, active) => void toggleProduct(id, active)}
                  onCreate={() => setEditing(null)}
                  onEdit={setEditing}
                  query={menuQuery}
                  onQueryChange={setMenuQuery}
                />
              ))}
            {section === "stock" && trackStock && (
              <BarStockPanel
                token={token}
                barId={barId}
                products={activeProducts}
                menu={menu}
                inventory={inventory}
                materials={materials}
                onSaved={refresh}
                onMaterialCreated={materialCreated}
                onShowProduct={(id) => {
                  setSection("menu");
                  setMenuQuery(
                    catalog.find((product) => product.id === id)?.name ?? "",
                  );
                }}
              />
            )}
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
    </div>
  );
}
