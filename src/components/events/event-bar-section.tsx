import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus, Store, Users, Utensils } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { EventBarRow, EventBarsResponse } from "@/types/event-dashboard";
import { BarDetailView } from "./bar-detail-view";
import { moneyLabel } from "./bar-workspace-model";
import "./bar-workspace.css";

type Props = {
  eventId: string;
  trackStock?: boolean;
  onLogisticsChange?: () => void;
};

export function EventBarSection({
  eventId,
  trackStock = true,
  onLogisticsChange,
}: Props) {
  const token = useAuthStore((s) => s.token);
  const [bars, setBars] = useState<EventBarRow[]>([]);
  const [openBarId, setOpenBarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      setBars(
        (
          await apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
            token,
          })
        ).bars,
      );
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudieron cargar las barras",
      );
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!token || busy || !name.trim()) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ bar: EventBarRow }>(
        `/events/${eventId}/bars`,
        { method: "POST", token, body: JSON.stringify({ name: name.trim() }) },
      );
      setCreating(false);
      setName("");
      setOpenBarId(result.bar.id);
      onLogisticsChange?.();
      void load();
      toast.success("Barra creada");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo crear la barra",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bar-workspace">
      {openBarId ? (
        <BarDetailView
          key={`${eventId}:${openBarId}`}
          eventId={eventId}
          barId={openBarId}
          trackStock={trackStock}
          onBack={() => {
            setOpenBarId(null);
            void load();
          }}
          onChanged={onLogisticsChange}
        />
      ) : (
        <>
          <div className="bw-heading">
            <div>
              <h3>Tus barras</h3>
              <p>
                {bars.length === 1
                  ? "1 punto de venta"
                  : `${bars.length} puntos de venta`}
              </p>
            </div>
            {!creating && (
              <button className="bw-primary" onClick={() => setCreating(true)}>
                <Plus size={17} />
                Nueva barra
              </button>
            )}
          </div>
          {creating && (
            <form
              className="bw-create-bar"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label htmlFor="bar-name">Nombre de la barra</label>
              <div className="bw-form-actions">
                <input
                  id="bar-name"
                  autoFocus
                  maxLength={100}
                  placeholder="Ej. Barra principal"
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="bw-primary" disabled={busy || !name.trim()}>
                  {busy ? "Creando…" : "Crear barra"}
                </button>
                <button
                  type="button"
                  className="bw-secondary"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {loading ? (
            <div className="bw-skeleton" aria-label="Cargando barras" />
          ) : error ? (
            <div role="alert" className="bw-error">
              {error}
              <button
                className="bw-secondary"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                Reintentar
              </button>
            </div>
          ) : bars.length === 0 ? (
            <div className="bw-empty">
              <Store size={32} />
              <h4>Tu primera barra empieza acá</h4>
              <p>
                Creá un punto de venta para armar su menú
                {trackStock ? " y cargar su stock" : ""}.
              </p>
              {!creating && (
                <button
                  className="bw-primary"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={17} />
                  Crear barra
                </button>
              )}
            </div>
          ) : (
            <div className="bw-bar-list">
              {bars.map((bar) => (
                <button
                  key={bar.id}
                  className="bw-bar-row"
                  onClick={() => setOpenBarId(bar.id)}
                >
                  <span className="bw-bar-icon">
                    <Store size={23} />
                  </span>
                  <span className="bw-bar-info">
                    <span className="bw-bar-name">
                      {bar.name}
                      {bar.isActive === false && (
                        <span className="bw-status">Inactiva</span>
                      )}
                    </span>
                    <span className="bw-bar-meta">
                      <span>
                        <Utensils size={14} />
                        {bar.productList.length} productos
                      </span>
                      <span>
                        <Users size={14} />
                        {bar.staffList.length} en equipo
                      </span>
                    </span>
                  </span>
                  <span className="bw-bar-sales">
                    <small>Vendido</small>
                    <strong>{moneyLabel(bar.totalSales ?? "0")}</strong>
                  </span>
                  <ArrowRight size={18} className="bw-row-arrow" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
