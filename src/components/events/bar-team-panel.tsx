import { useState } from "react";
import { Check, Search, Users } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const assigned = staff.filter(
    (member) => member.isAssigned && member.barId === barId,
  );
  const hasBartenders = staff.some((member) =>
    (member.roles?.length ? member.roles : [member.role]).includes("BARTENDER"),
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
    <section aria-label="Equipo de la barra">
      <div className="bw-tab-head">
        <p className="bw-lede">
          {assigned.length}{" "}
          {assigned.length === 1 ? "persona asignada" : "personas asignadas"}
        </p>
      </div>

      <div className="bw-team-section-head">
        <h4>En esta barra</h4>
      </div>
      {assigned.length ? (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                  Persona
                </TableHead>
                <TableHead className="text-[11px] font-normal lowercase text-white/45">
                  Rol
                </TableHead>
                <TableHead className="w-[110px] pr-4">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {assigned.map((member) => (
                <TableRow
                  key={member.id}
                  className="border-0 hover:bg-white/[0.03]"
                >
                  <TableCell className="py-3.5 pl-4 text-[15px] font-medium text-foreground">
                    {member.name}
                  </TableCell>
                  <TableCell className="py-3.5 text-[13px] text-white/55">
                    {staffRoleLabel(member.role)}
                  </TableCell>
                  <TableCell className="py-3.5 pr-4 text-right">
                    <button
                      type="button"
                      className="bw-danger-text whitespace-nowrap"
                      disabled={busy !== null}
                      aria-label={`Quitar a ${member.name} de la barra`}
                      onClick={() => void assign(member, false)}
                    >
                      {busy === member.id ? "Quitando…" : "Quitar"}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="bw-muted">Todavía no hay nadie asignado a esta barra.</p>
      )}

      <div className="bw-team-section">
        <div className="bw-team-section-head">
          <div>
            <h4>Personal de barra</h4>
            <p>
              Elegí quién atiende esta barra. Si está en otro puesto, se mueve.
            </p>
          </div>
        </div>
        {hasBartenders ? (
          <label className="bw-search">
            <Search size={17} />
            <input
              aria-label="Buscar persona"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        ) : null}
        {available.length ? (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white/[0.02]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                  <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                    Persona
                  </TableHead>
                  <TableHead className="text-[11px] font-normal lowercase text-white/45">
                    Puesto
                  </TableHead>
                  <TableHead className="w-[200px] pr-4">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {available.map((member) => {
                  const otherBar = member.barId
                    ? bars.find((bar) => bar.id === member.barId)?.name
                    : null;
                  return (
                    <TableRow
                      key={member.id}
                      className="border-0 hover:bg-white/[0.03]"
                    >
                      <TableCell className="py-3.5 pl-4 text-[15px] font-medium text-foreground">
                        {member.name}
                      </TableCell>
                      <TableCell className="py-3.5 text-[13px] text-white/55">
                        {otherBar ? `En ${otherBar}` : "Sin asignar"}
                      </TableCell>
                      <TableCell className="py-3.5 pr-4 text-right">
                        <button
                          className="bw-secondary bw-table-action whitespace-nowrap"
                          disabled={busy !== null}
                          aria-label={
                            otherBar
                              ? `Mover a ${member.name} a esta barra`
                              : `Asignar a ${member.name} a esta barra`
                          }
                          onClick={() => void assign(member, true)}
                        >
                          {busy === member.id ? (
                            "Asignando…"
                          ) : (
                            <>
                              <Check size={15} />
                              {otherBar
                                ? "Mover a esta barra"
                                : "Asignar a esta barra"}
                            </>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bw-empty">
            <Users size={28} />
            <h4>
              {query
                ? "No hay coincidencias"
                : hasBartenders
                  ? "Todo el personal de barra ya está en esta barra"
                  : "No hay personal con rol Barra"}
            </h4>
            <p>
              {query
                ? "Probá con otro nombre."
                : "Podés asignar el rol Barra desde la sección Equipo del evento."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
