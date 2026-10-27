import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  EventSaleRowApi,
  EventSalesPageResponse,
} from "@/types/event-dashboard";
import { moneyLabel } from "./bar-workspace-model";

const payment: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  MERCADOPAGO: "Mercado Pago",
  TRANSFER: "Transferencia",
  SALDO: "Saldo",
};

export function BarSalesPanel({
  token,
  eventId,
  barId,
  total,
}: {
  token: string | null;
  eventId: string;
  barId: string;
  total: string;
}) {
  const [sales, setSales] = useState<EventSaleRowApi[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    async (offset: number) => {
      if (!token) return;
      setBusy(true);
      setError("");
      try {
        const result = await apiFetch<EventSalesPageResponse>(
          `/events/${eventId}/sales?barId=${barId}&limit=50&offset=${offset}`,
          { token },
        );
        setSales((prev) =>
          offset ? [...prev, ...result.sales] : result.sales,
        );
        setMore(result.hasMore);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : "No se pudieron cargar las ventas",
        );
      } finally {
        setBusy(false);
      }
    },
    [token, eventId, barId],
  );
  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <section aria-label="Ventas de la barra">
      <div className="bw-tab-head">
        <p className="bw-lede">
          Total vendido{" "}
          <strong className="bw-sales-total">{moneyLabel(total)}</strong>
        </p>
        <button
          className="bw-secondary"
          disabled={busy}
          onClick={() => void load(0)}
        >
          <RefreshCw size={15} className={busy ? "bw-spin" : undefined} />
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      {error && (
        <div role="alert" className="bw-error">
          {error}
          <button
            className="bw-secondary"
            onClick={() => void load(sales.length)}
          >
            Reintentar
          </button>
        </div>
      )}
      {busy && !sales.length ? (
        <div className="bw-skeleton" aria-label="Cargando ventas" />
      ) : sales.length ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
            <Table className="table-fixed md:table-auto">
              <TableHeader>
                <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                  <TableHead className="w-[20%] pl-4 text-[11px] font-normal lowercase text-white/45 md:w-auto">
                    Fecha
                  </TableHead>
                  <TableHead className="w-[44%] pl-4 text-[11px] font-normal lowercase text-white/45 md:w-auto">
                    Cliente
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 md:table-cell">
                    Pedido
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 md:table-cell">
                    Pago
                  </TableHead>
                  <TableHead className="w-[36%] pr-4 text-right text-[11px] font-normal lowercase text-white/45 md:w-auto">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {sales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="border-0 hover:bg-white/[0.03]"
                  >
                    <TableCell className="whitespace-nowrap py-3.5 pl-4 text-[12px] tabular-nums text-white/45">
                      <div className="truncate">
                        {sale.createdAt ? (
                          <>
                            {/* En mobile alcanza con la hora: la fecha del evento está en el encabezado. */}
                            <span className="sm:hidden">
                              {new Date(sale.createdAt).toLocaleTimeString("es-AR", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </span>
                            <span className="hidden sm:inline">
                              {new Date(sale.createdAt).toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] py-3.5 pl-4">
                      <div
                        className="flex min-w-0 items-baseline gap-2"
                        title={`${sale.customerName?.trim() || "Consumidor final"}${sale.staffName ? ` · ${sale.staffName}` : ""} · ${sale.itemsSummary} · ${payment[sale.paymentMethod] ?? sale.paymentMethod}`}
                      >
                        <span className="truncate text-[14px] font-medium text-foreground">
                          {sale.customerName?.trim() || "Consumidor final"}
                        </span>
                        {sale.staffName ? (
                          <span className="hidden truncate text-[12px] text-white/40 sm:inline">
                            {sale.staffName}
                          </span>
                        ) : null}
                        <span className="shrink-0 text-[11px] text-white/40 md:hidden">
                          {payment[sale.paymentMethod] ?? sale.paymentMethod}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[320px] truncate py-3.5 text-[13px] text-white/55 md:table-cell">
                      <span title={sale.itemsSummary}>{sale.itemsSummary}</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-3.5 text-[13px] text-white/55 md:table-cell">
                      {payment[sale.paymentMethod] ?? sale.paymentMethod}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3.5 pr-4 text-right text-[14px] font-medium tabular-nums text-foreground">
                      {moneyLabel(sale.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {more && (
            <div className="bw-load-more">
              <button
                className="bw-secondary"
                disabled={busy}
                onClick={() => void load(sales.length)}
              >
                {busy ? "Cargando…" : "Ver más ventas"}
              </button>
            </div>
          )}
        </>
      ) : (
        !error && (
          <div className="bw-empty">
            <h4>Las ventas de esta barra aparecerán acá</h4>
          </div>
        )
      )}
    </section>
  );
}
