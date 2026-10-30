import { useId, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { ArrowLeft, Plus, X } from "lucide-react";
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
import type { ApiInventoryItem } from "@/types/inventory";
import { NewMaterialRow } from "./bar-new-material-row";
import {
  byRecentCreation,
  decimalInput,
  type RecipeDraftLine,
  type RecipeMode,
} from "./bar-workspace-model";

const validValue = (mode: RecipeMode, value: string) => {
  const raw = decimalInput(value);
  if (mode === "BOTTLE") return /^\d{1,6}$/.test(raw) && Number(raw) >= 1;
  return /^\d{1,6}(\.\d{1,3})?$/.test(raw) && new Decimal(raw).gt(0);
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  mode: RecipeMode;
  productName: string;
  materials: ApiInventoryItem[];
  initialLines: RecipeDraftLine[];
  onMaterialCreated: (item: ApiInventoryItem) => void;
  /** Devuelve `true` cuando la receta quedó guardada y el diálogo puede cerrarse. */
  onSave: (lines: RecipeDraftLine[]) => Promise<boolean> | boolean;
};

export function BarRecipeDialog({
  open,
  onOpenChange,
  token,
  mode,
  productName,
  materials,
  initialLines,
  onMaterialCreated,
  onSave,
}: Props) {
  const id = useId();
  const [step, setStep] = useState<"pick" | "amounts">("pick");
  const [selected, setSelected] = useState<string[]>(() =>
    initialLines.map((line) => line.inventoryItemId),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialLines.map((line) => [line.inventoryItemId, line.value]),
    ),
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const sorted = useMemo(
    () => [...materials].sort(byRecentCreation),
    [materials],
  );
  const name = productName.trim() || "este producto";
  const valueFor = (itemId: string) =>
    values[itemId] ?? (mode === "BOTTLE" ? "1" : "");
  const chosen = selected
    .map((itemId) => materials.find((item) => item.id === itemId))
    .filter((item): item is ApiInventoryItem => item != null);
  const allValid = chosen.every((item) => validValue(mode, valueFor(item.id)));

  function toggle(itemId: string) {
    setSelected((prev) =>
      prev.includes(itemId)
        ? prev.filter((value) => value !== itemId)
        : [...prev, itemId],
    );
  }
  async function save() {
    if (saving || !chosen.length || !allValid) return;
    setSaving(true);
    try {
      await onSave(
        chosen.map((item) => ({
          inventoryItemId: item.id,
          inventoryItemName: item.name,
          value: decimalInput(valueFor(item.id)),
        })),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent
        className="bar-workspace bw-dialog bw-recipe-dialog sm:max-w-lg"
        overlayClassName="bg-black/70"
        showCloseButton={false}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bw-dialog-head">
          <div className="min-w-0">
            <DialogTitle className="bw-dialog-title truncate">
              {mode === "GLASS" ? "Receta de " : "Botellas de "}
              {name}
            </DialogTitle>
            <DialogDescription className="bw-dialog-hint">
              {step === "pick"
                ? mode === "GLASS"
                  ? "Elegí los insumos que se usan para preparar cada venta."
                  : "Elegí las botellas que se entregan con cada venta."
                : mode === "GLASS"
                  ? "Indicá cuánto rinde cada insumo. Se cuentan en unidades."
                  : "Indicá cuántas botellas se descuentan con cada venta."}
            </DialogDescription>
          </div>
          <button
            type="button"
            className="bw-icon-button"
            aria-label="Cerrar"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="bw-recipe-dialog-body">
          {step === "pick" ? (
            <>
              <div className="bw-recipe-dialog-tools">
                <p>
                  {selected.length
                    ? `${selected.length} ${selected.length === 1 ? "insumo elegido" : "insumos elegidos"}`
                    : "Ningún insumo elegido"}
                </p>
                <button
                  type="button"
                  className="bw-secondary bw-table-action"
                  disabled={creating}
                  onClick={() => setCreating(true)}
                >
                  <Plus size={15} aria-hidden="true" />
                  Nuevo insumo
                </button>
              </div>
              <div className="max-h-[min(50vh,420px)] overflow-y-auto rounded-2xl bg-white/[0.02] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sorted.length || creating ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                        <TableHead className="pl-4 text-[11px] font-normal lowercase text-white/45">
                          Insumo
                        </TableHead>
                        <TableHead className="w-[96px] pr-4 text-right text-[11px] font-normal lowercase text-white/45">
                          Usar
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                      {creating && (
                        <NewMaterialRow
                          token={token}
                          materials={materials}
                          onCancel={() => setCreating(false)}
                          onCreated={(item) => {
                            onMaterialCreated(item);
                            setSelected((prev) => [...prev, item.id]);
                            setCreating(false);
                          }}
                        />
                      )}
                      {sorted.map((item) => {
                        const checked = selected.includes(item.id);
                        return (
                          <TableRow
                            key={item.id}
                            onClick={() => toggle(item.id)}
                            className={`cursor-pointer border-0 ${checked ? "bg-[#FF9500]/10 hover:bg-[#FF9500]/10" : "hover:bg-white/[0.03]"}`}
                          >
                            <TableCell className="max-w-0 py-3 pl-4">
                              <span
                                className="block truncate text-[14px] font-medium text-foreground"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 pr-4 text-right">
                              <input
                                type="checkbox"
                                className="bw-check"
                                checked={checked}
                                aria-label={`Usar ${item.name}`}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggle(item.id)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="px-4 py-6 text-[13px] text-white/45">
                    Todavía no hay insumos. Creá el primero con{" "}
                    <strong className="text-white/70">Nuevo insumo</strong>.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="max-h-[min(50vh,420px)] overflow-y-auto rounded-2xl bg-white/[0.02] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Table>
                <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                  {chosen.map((item, index) => {
                    const value = valueFor(item.id);
                    const invalid = value.trim() !== "" && !validValue(mode, value);
                    return (
                      <TableRow
                        key={item.id}
                        className="border-0 hover:bg-transparent"
                      >
                        <TableCell className="whitespace-normal py-3 pl-4 text-[14px] text-white/80">
                          <label htmlFor={`${id}-${item.id}`} className="bw-recipe-question">
                            {mode === "GLASS" ? (
                              <>
                                ¿Cuántas ventas de <strong>{name}</strong> se
                                necesitan para terminar 1{" "}
                                <strong>{item.name}</strong>?
                              </>
                            ) : (
                              <>
                                ¿Cuántas botellas de <strong>{item.name}</strong>{" "}
                                consume cada venta de <strong>{name}</strong>?
                              </>
                            )}
                          </label>
                        </TableCell>
                        <TableCell className="w-[104px] py-3 pr-4 align-middle">
                          <input
                            id={`${id}-${item.id}`}
                            autoFocus={index === 0}
                            inputMode={mode === "GLASS" ? "decimal" : "numeric"}
                            className="bw-recipe-amount"
                            aria-invalid={invalid || undefined}
                            placeholder={mode === "GLASS" ? "Ej. 10" : "1"}
                            value={value}
                            disabled={saving}
                            onChange={(e) =>
                              setValues((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void save();
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div className="bw-recipe-dialog-footer">
          {step === "amounts" && (
            <button
              type="button"
              className="bw-secondary"
              disabled={saving}
              onClick={() => setStep("pick")}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Volver
            </button>
          )}
          {step === "pick" ? (
            <button
              type="button"
              className="bw-primary"
              disabled={!chosen.length || creating}
              onClick={() => setStep("amounts")}
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              className="bw-primary"
              disabled={saving || !chosen.length || !allValid}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
