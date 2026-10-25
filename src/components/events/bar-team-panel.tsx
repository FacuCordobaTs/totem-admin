import { useState } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { staffRoleLabel } from "@/lib/role-labels";
import type {
  EventAssignmentStaffRow,
  EventBarRow,
} from "@/types/event-dashboard";
import { normalizeSearch } from "./bar-workspace-model";
export function BarTeamPanel({
  token,
  eventId,
  barId,
  staff,
  bars,
  onSaved,
}: {
  token: string | null;
  eventId: string;
  barId: string;
  staff: EventAssignmentStaffRow[];
  bars: EventBarRow[];
  onSaved: () => Promise<void>;
}) {
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const assigned = staff.filter(
    (member) => member.isAssigned && member.barId === barId,
  );
  const available = staff.filter(
    (member) =>
      (member.roles?.length ? member.roles : [member.role]).includes(
        "BARTENDER",
      ) &&
      member.barId !== barId &&
      normalizeSearch(member.name).includes(normalizeSearch(query)),
  );
  async function assign(member: EventAssignmentStaffRow, add: boolean) {
    if (!token || busy) return;
    setBusy(member.id);
    try {
      await apiFetch(`/events/${eventId}/staff/assign`, {
        method: "POST",
        token,
        body: JSON.stringify({
          staffId: member.id,
          isAssigned: true,
          barId: add ? barId : null,
        }),
      });
      await onSaved();
      toast.success(
        add ? "Persona asignada a la barra" : "Persona retirada de la barra",
      );
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo actualizar el equipo",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section>
      <div className="bw-heading">
        <div>
          <h3>Equipo de la barra</h3>
          <p>
            {assigned.length}{" "}
            {assigned.length === 1 ? "persona asignada" : "personas asignadas"}
          </p>
        </div>
        <button className="bw-primary" onClick={() => setPicker(!picker)}>
          <Plus size={17} />
          Asignar persona
        </button>
      </div>
      {picker && (
        <div className="bw-catalog-picker">
          <div className="bw-heading">
            <h4>Elegir del equipo</h4>
            <button
              className="bw-icon-button"
              aria-label="Cerrar selector de equipo"
              onClick={() => setPicker(false)}
            >
              <X size={17} />
            </button>
          </div>
          <label className="bw-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Buscar persona"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="bw-picker-results">
            {available.map((member) => (
              <div key={member.id} className="bw-picker-row">
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {staffRoleLabel("BARTENDER")}
                    {member.barId
                      ? ` · En ${bars.find((bar) => bar.id === member.barId)?.name ?? "otra barra"}`
                      : ""}
                  </small>
                </span>
                <button
                  className="bw-secondary"
                  disabled={busy !== null}
                  onClick={() => void assign(member, true)}
                >
                  {busy === member.id
                    ? "Asignando…"
                    : member.barId
                      ? "Mover a esta barra"
                      : "Asignar"}
                </button>
              </div>
            ))}
            {!available.length && (
              <p className="bw-muted">
                No hay personal de barra disponible. Podés asignar el rol Barra
                desde la sección Equipo del evento.
              </p>
            )}
          </div>
        </div>
      )}
      {assigned.length ? (
        <div className="bw-team-list">
          {assigned.map((member) => (
            <div className="bw-picker-row" key={member.id}>
              <span className="bw-avatar" aria-hidden="true">
                {member.name.charAt(0).toLocaleUpperCase()}
              </span>
              <span className="bw-grow">
                <strong>{member.name}</strong>
                <small>{staffRoleLabel(member.role)}</small>
              </span>
              <button
                className="bw-secondary"
                disabled={busy !== null}
                onClick={() => void assign(member, false)}
              >
                {busy === member.id ? "Quitando…" : "Quitar de la barra"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bw-empty">
          <Users size={30} />
          <h4>Elegí quién trabaja en esta barra</h4>
          <button className="bw-secondary" onClick={() => setPicker(true)}>
            Asignar del equipo
          </button>
        </div>
      )}
    </section>
  );
}
