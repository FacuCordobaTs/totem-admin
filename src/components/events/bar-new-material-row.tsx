import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ApiInventoryItem } from "@/types/inventory";
import { normalizeSearch } from "./bar-workspace-model";

type Props = {
  token: string | null;
  materials: ApiInventoryItem[];
  /** Celdas vacías entre el nombre y la acción, para alinear con la tabla que la contiene. */
  middleCells?: number;
  onCreated: (item: ApiInventoryItem) => void;
  onCancel: () => void;
};

/**
 * Alta de un insumo como primera fila de una tabla: el nombre enfocado y Guardar en
 * lugar de la acción de la fila. Un insumo sólo tiene nombre; se cuenta en unidades.
 */
export function NewMaterialRow({
  token,
  materials,
  middleCells = 0,
  onCreated,
  onCancel,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (!token || busy || !trimmed) return;
    if (
      materials.some(
        (item) => normalizeSearch(item.name.trim()) === normalizeSearch(trimmed),
      )
    ) {
      setError("Ya existe un insumo con ese nombre.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ item: ApiInventoryItem }>(
        "/inventory/items",
        { method: "POST", token, body: JSON.stringify({ name: trimmed }) },
      );
      onCreated({
        ...result.item,
        createdAt: result.item.createdAt ?? new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el insumo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow className="border-0 bg-white/[0.03] hover:bg-white/[0.03]">
      <TableCell className="py-2 pl-4">
        <input
          autoFocus
          aria-label="Nombre del insumo nuevo"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-material-error" : undefined}
          className="bw-new-material-input"
          placeholder="Nombre del insumo"
          maxLength={255}
          value={name}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape" && !busy) {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
        />
        {error && (
          <span
            id="new-material-error"
            role="alert"
            className="mt-1 block truncate text-[12px] text-[#fda4af]"
          >
            {error}
          </span>
        )}
      </TableCell>
      {Array.from({ length: middleCells }, (_, index) => (
        <TableCell key={index} className="py-2" />
      ))}
      <TableCell className="w-[96px] py-2 pr-4 text-right">
        <button
          type="button"
          className="bw-secondary bw-table-action whitespace-nowrap"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </TableCell>
    </TableRow>
  );
}
