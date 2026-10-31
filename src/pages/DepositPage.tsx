import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Loader2, Warehouse } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { DepositWorkspace } from "@/components/events/deposit-workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { ApiEvent } from "@/types/events";

type EventsResponse = { events: ApiEvent[] };

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Superficie propia del rol Depósito: elige uno de sus eventos asignados y opera el stock
 * general del evento y los envíos a cada barra. No expone ventas, entradas ni caja.
 */
export function DepositPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<EventsResponse>("/events", { token });
      setEvents(result.events);
    } catch (e) {
      setEvents([]);
      setError(
        e instanceof ApiError ? e.message : "No se pudieron cargar tus eventos",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = events.find((event) => event.id === id) ?? events[0] ?? null;

  useEffect(() => {
    if (!loading && events.length > 0 && selected && id !== selected.id) {
      navigate(`/deposito/${selected.id}`, { replace: true });
    }
  }, [events, id, loading, navigate, selected]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link
            to="/deposito"
            className="flex min-w-0 items-center gap-2.5"
            aria-label="Depósito"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden text-[15px] font-semibold sm:inline">
              Depósito
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {events.length > 0 && selected ? (
              <Select
                value={selected.id}
                onValueChange={(value) => navigate(`/deposito/${value}`)}
              >
                <SelectTrigger
                  aria-label="Elegir evento"
                  className="h-9 w-[150px] rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none sm:w-[280px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <LogoutButton variant="ghost" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        {loading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" />
            <p className="text-[15px] text-white/45">Cargando eventos…</p>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-2xl bg-white/[0.02] p-8 text-center">
            <p role="alert" className="text-[15px] text-rose-300">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 h-10 rounded-xl bg-white/[0.06] px-4 text-[13px] font-semibold text-white hover:bg-white/[0.1]"
            >
              Reintentar
            </button>
          </div>
        ) : !selected ? (
          <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl bg-white/[0.02] px-6 py-16 text-center">
            <Warehouse className="mb-3 h-7 w-7 text-white/25" aria-hidden="true" />
            <h1 className="text-xl font-semibold">No tenés eventos asignados</h1>
            <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-white/45">
              Pedile a la productora que te asigne al evento donde vas a controlar
              el depósito y las barras.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/35">
                Control de stock
              </p>
              <h1 className="mt-1.5 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
                {selected.name}
              </h1>
              <p className="mt-2 text-[14px] text-white/45">
                {[formatEventDate(selected.date), selected.venue ?? selected.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <DepositWorkspace key={selected.id} eventId={selected.id} />
          </>
        )}
      </main>
    </div>
  );
}
