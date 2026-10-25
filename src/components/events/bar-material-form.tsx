import { useId, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
import {
  decimalInput,
  normalizeSearch,
  singularStockUnit,
} from "./bar-workspace-model";

export function BarMaterialForm({
  token,
  materials,
  onCreated,
  onCancel,
  item,
}: {
  item?: ApiInventoryItem;
  token: string | null;
  materials: ApiInventoryItem[];
  onCreated: (item: ApiInventoryItem) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<"UNIT" | "ML" | "GRAMS">(
    item?.baseUnit ?? "UNIT",
  );
  const [size, setSize] = useState(item?.packageSize ?? "");
  const [countingUnit, setCountingUnit] = useState(
    item ? singularStockUnit(item) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!token || busy || !name.trim()) return;
    setError("");
    if (
      materials.some(
        (material) =>
          material.id !== item?.id &&
          normalizeSearch(material.name.trim()) ===
            normalizeSearch(name.trim()),
      )
    ) {
      setError("Ya existe un insumo con ese nombre. Seleccionalo de la lista.");
      return;
    }
    if (
      kind !== "UNIT" &&
      (!/^\d+(\.\d{1,2})?$/.test(decimalInput(size)) ||
        Number(decimalInput(size)) <= 0)
    ) {
      setError("Ingresá el contenido del envase, mayor a cero.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{ item: ApiInventoryItem }>(
        "/inventory/items",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            ...(item ? { id: item.id } : {}),
            name: name.trim(),
            baseUnit: kind,
            packageSize: kind === "UNIT" ? "1" : decimalInput(size),
            countingUnit: item
              ? countingUnit.trim() || item.countingUnit || "unidad"
              : kind === "ML"
                ? "botellas"
                : kind === "GRAMS"
                  ? "paquetes"
                  : "unidades",
          }),
        },
      );
      onCreated(result.item);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo crear el insumo",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bw-material-form">
      <h4>{item ? "Editar insumo" : "Nuevo insumo"}</h4>
      <div className="bw-fields">
        <label htmlFor={`${id}-name`}>
          Nombre
          <input
            autoFocus
            id={`${id}-name`}
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Fernet 750 ml"
            disabled={busy}
          />
        </label>
        <label htmlFor={`${id}-kind`}>
          Se cuenta en
          <select
            id={`${id}-kind`}
            value={kind}
            disabled={busy || !!item}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="UNIT">Unidades</option>
            <option value="ML">Botellas</option>
            <option value="GRAMS">Paquetes / bolsas</option>
          </select>
        </label>
        {kind !== "UNIT" && (
          <label htmlFor={`${id}-size`}>
            Contenido por {kind === "ML" ? "botella (ml)" : "paquete (g)"}
            <input
              id={`${id}-size`}
              inputMode="decimal"
              value={size}
              disabled={busy || !!item}
              onChange={(e) => setSize(e.target.value)}
              placeholder={kind === "ML" ? "750" : "1000"}
            />
          </label>
        )}
        {item && (
          <label htmlFor={`${id}-counting`}>
            Unidad de conteo
            <input
              id={`${id}-counting`}
              value={countingUnit}
              maxLength={50}
              disabled={busy}
              onChange={(e) => setCountingUnit(e.target.value)}
              placeholder="Ej. lata, botella, bolsa"
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="bw-error">
          {error}
        </p>
      )}
      <div className="bw-form-actions">
        <button
          type="button"
          className="bw-primary"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : item ? "Guardar insumo" : "Crear insumo"}
        </button>
        <button
          type="button"
          className="bw-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
