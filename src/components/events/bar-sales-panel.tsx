import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
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
    <section>
      <div className="bw-heading">
        <div>
          <h3>Ventas de la barra</h3>
          <p>
            Total vendido:{" "}
            <strong className="bw-sales-total">{moneyLabel(total)}</strong>
          </p>
        </div>
        <button
          className="bw-secondary"
          disabled={busy}
          onClick={() => void load(0)}
        >
          Actualizar
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
          <div className="bw-sales-scroll">
            <table className="bw-sales-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente / atención</th>
                  <th>Pedido</th>
                  <th>Pago</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      {sale.createdAt
                        ? new Date(sale.createdAt).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td>
                      <strong>
                        {sale.customerName?.trim() || "Consumidor final"}
                      </strong>
                      <small>{sale.staffName ?? ""}</small>
                    </td>
                    <td>{sale.itemsSummary}</td>
                    <td>{payment[sale.paymentMethod] ?? sale.paymentMethod}</td>
                    <td>{moneyLabel(sale.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
