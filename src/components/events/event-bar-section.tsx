import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
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
import type { EventBarRow, EventBarsResponse } from "@/types/event-dashboard";
import { BarDetailView } from "./bar-detail-view";
import { moneyLabel } from "./bar-workspace-model";
import { useEventNestedView } from "./event-mobile-nav";
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
  useEventNestedView(openBarId != null);
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

  const activeCount = bars.filter((bar) => bar.isActive !== false).length;
  const summary =
    bars.length === 0
      ? ""
      : [
          `${bars.length} ${bars.length === 1 ? "punto de venta" : "puntos de venta"}`,
          activeCount === bars.length
            ? null
            : `${activeCount} ${activeCount === 1 ? "activo" : "activos"}`,
        ]
          .filter(Boolean)
          .join(" · ");

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
          {!loading && !error && bars.length > 0 && (
            <div className="bw-list-head">
              <p className="bw-lede">{summary}</p>
              <button className="bw-primary" onClick={() => setCreating(true)}>
                <Plus size={17} />
                Nueva barra
              </button>
            </div>
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
              <h4>Tu primera barra empieza acá</h4>
              <p>
                Creá un punto de venta para armar su menú
                {trackStock ? " y cargar su stock" : ""}.
              </p>
              <button className="bw-primary" onClick={() => setCreating(true)}>
                <Plus size={17} />
                Crear barra
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
              <Table className="table-fixed sm:table-auto">
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className="w-[52%] pl-4 text-[11px] font-normal lowercase text-white/45 sm:w-auto">
                      Barra
                    </TableHead>
                    <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                      Menú
                    </TableHead>
                    <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                      Equipo
                    </TableHead>
                    <TableHead className="w-[36%] text-right text-[11px] font-normal lowercase text-white/45 sm:w-auto">
                      Vendido
                    </TableHead>
                    <TableHead className="w-10 pr-4">
                      <span className="sr-only">Abrir barra</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                  {bars.map((bar) => {
                    const products = bar.productList.length;
                    const team = bar.staffList.length;
                    return (
                      <TableRow
                        key={bar.id}
                        tabIndex={0}
                        aria-label={`Abrir ${bar.name}`}
                        onClick={() => setOpenBarId(bar.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setOpenBarId(bar.id);
                          }
                        }}
                        className="cursor-pointer border-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-[#ff9500] focus-visible:-outline-offset-2"
                      >
                        <TableCell className="py-3.5 pl-4">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span
                              className="truncate text-[15px] font-medium text-foreground"
                              title={bar.name}
                            >
                              {bar.name}
                            </span>
                            {bar.isActive === false && (
                              <span className="bw-status">Inactiva</span>
                            )}
                            {products === 0 && (
                              <span className="bw-status hidden sm:inline">Sin menú</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-[13px] tabular-nums text-white/55 sm:table-cell">
                          {products}
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-[13px] tabular-nums text-white/55 sm:table-cell">
                          {team}
                        </TableCell>
                        <TableCell className="py-3.5 text-right text-[14px] font-medium tabular-nums text-foreground">
                          {moneyLabel(bar.totalSales ?? "0")}
                        </TableCell>
                        <TableCell className="py-3.5 pr-4">
                          <ArrowRight
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
        </>
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (busy) return;
          setCreating(open);
          if (!open) setName("");
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
                Nueva barra
              </DialogTitle>
              <DialogDescription className="bw-dialog-hint">
                Cada barra tiene su propio menú, equipo y existencias.
              </DialogDescription>
            </div>
            <button
              type="button"
              className="bw-icon-button"
              aria-label="Cerrar"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              <X size={17} />
            </button>
          </div>
          <form
            className="bw-dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label htmlFor="bar-name">
              Nombre de la barra
              <input
                id="bar-name"
                autoFocus
                maxLength={100}
                placeholder="Ej. Barra principal"
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="bw-form-actions">
              <button
                className="bw-primary"
                disabled={busy || !name.trim()}
              >
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
