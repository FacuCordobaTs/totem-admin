import { useState } from "react";
import { ArrowLeft, Check, Plus, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
import { BarMaterialForm } from "./bar-material-form";
import { normalizeSearch, packageDescription } from "./bar-workspace-model";

type Props = {
  token: string | null;
  materials: ApiInventoryItem[];
  selectedIds: string[];
  disabled: boolean;
  onSelect: (item: ApiInventoryItem) => void;
  onCreated: (item: ApiInventoryItem) => void;
  onOpenChange: (open: boolean) => void;
  onBusyChange: (busy: boolean) => void;
};

export function BarRecipeMaterialPicker({
  token,
  materials,
  selectedIds,
  disabled,
  onSelect,
  onCreated,
  onOpenChange,
  onBusyChange,
}: Props) {
  const [view, setView] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const matches = materials
    .filter((item) =>
      normalizeSearch(item.name).includes(normalizeSearch(query.trim())),
    )
    .sort(
      (a, b) =>
        Number(selectedIds.includes(a.id)) -
        Number(selectedIds.includes(b.id)),
    );

  function openCreate() {
    setView("create");
    onOpenChange(true);
  }
  function backToSearch() {
    setView("search");
    onOpenChange(false);
  }

  if (view === "create") {
    return (
      <div className="bw-material-picker">
        <div className="bw-material-picker-inline">
          <button
            type="button"
            className="bw-back"
            disabled={saving}
            onClick={backToSearch}
          >
            <ArrowLeft size={15} />
            Volver a los insumos
          </button>
          <div className="bw-material-picker-head">
            <div>
              <h4>Crear insumo</h4>
              <p>Se agrega al inventario y a esta receta.</p>
            </div>
          </div>
          <BarMaterialForm
            token={token}
            materials={materials}
            initialName={query.trim()}
            embedded
            submitLabel="Crear y agregar a la receta"
            onBusyChange={(value) => {
              setSaving(value);
              onBusyChange(value);
            }}
            onCancel={backToSearch}
            onCreated={(item) => {
              onCreated(item);
              backToSearch();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bw-material-picker">
      <div className="bw-material-picker-inline">
        <div className="bw-material-picker-head">
          <div>
            <h4>Insumos de la receta</h4>
            <p>Sumá los ingredientes que se descuentan con cada venta.</p>
          </div>
          <button
            type="button"
            className="bw-secondary"
            disabled={disabled}
            onClick={openCreate}
          >
            <Plus size={16} aria-hidden="true" />
            Crear insumo
          </button>
        </div>
        <label className="bw-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Buscar insumo"
            placeholder="Buscar insumo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          {matches.length ? (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                  <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                    Insumo
                  </TableHead>
                  <TableHead className="hidden text-[11px] font-normal lowercase text-white/45 sm:table-cell">
                    Envase
                  </TableHead>
                  <TableHead className="w-[120px] pr-4">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {matches.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <TableRow
                      key={item.id}
                      className="border-0 hover:bg-white/[0.03]"
                    >
                      <TableCell className="py-3.5 pl-4 text-[14px] font-medium text-foreground">
                        {item.name}
                      </TableCell>
                      <TableCell className="hidden py-3.5 text-[12px] text-white/45 sm:table-cell">
                        {packageDescription(item)}
                      </TableCell>
                      <TableCell className="py-3.5 pr-4 text-right">
                        {selected ? (
                          <span className="bw-material-selected whitespace-nowrap">
                            <Check size={15} aria-hidden="true" />
                            En la receta
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="bw-secondary bw-table-action whitespace-nowrap"
                            disabled={disabled}
                            aria-label={`Agregar ${item.name} a la receta`}
                            onClick={() => onSelect(item)}
                          >
                            <Plus size={15} aria-hidden="true" />
                            Agregar
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="px-4 py-6 text-[13px] text-white/45" role="status">
              {materials.length
                ? "No hay insumos con ese nombre."
                : "Todavía no tenés insumos en tu inventario."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
