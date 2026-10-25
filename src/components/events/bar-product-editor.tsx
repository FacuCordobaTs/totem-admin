import { useId, useRef, useState } from "react";
import Decimal from "decimal.js";
import { ArrowLeft, Plus, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { ApiProduct } from "@/components/inventory/recipe-config";
import type { ApiInventoryItem } from "@/components/inventory/raw-materials";
import { ProductCategoryField } from "@/components/inventory/product-category-field";
import { ProductImageUploader } from "@/components/inventory/product-image-uploader";
import { BarMaterialForm } from "./bar-material-form";
import {
  consumptionPerSale,
  decimalInput,
  packageFactor,
  packageDescription,
  quantityLabel,
  singularStockUnit,
} from "./bar-workspace-model";

type RecipeDraft = { id: string; yield: string; quantity: string };
type Props = {
  token: string | null;
  eventId: string;
  barId: string;
  product: ApiProduct | null;
  price: string | undefined;
  directStock?: string | null;
  trackStock: boolean;
  materials: ApiInventoryItem[];
  onMaterialsChange: (item: ApiInventoryItem) => void;
  onCancel: () => void;
  onSaved: (productId: string, hasStock: boolean) => void;
};

export function BarProductEditor({
  token,
  eventId,
  barId,
  product,
  price,
  directStock,
  trackStock,
  materials,
  onMaterialsChange,
  onCancel,
  onSaved,
}: Props) {
  const id = useId();
  const [name, setName] = useState(product?.name ?? "");
  const [amount, setAmount] = useState(price ?? product?.price ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [saleType, setSaleType] = useState(product?.saleType ?? "GLASS");
  const [mode, setMode] = useState<"none" | "unit" | "recipe">(
    product
      ? product.recipes.length
        ? "recipe"
        : directStock != null
          ? "unit"
          : "none"
      : "unit",
  );
  const [lines, setLines] = useState<RecipeDraft[]>(
    () =>
      product?.recipes.map((line) => {
        const item = {
          baseUnit: line.inventoryBaseUnit,
          packageSize: line.inventoryPackageSize,
        };
        const consumption = consumptionPerSale(product, line);
        return {
          id: line.inventoryItemId,
          quantity: line.quantityUsed,
          yield: consumption.gt(0)
            ? packageFactor(item).div(consumption).toDecimalPlaces(3).toString()
            : "1",
        };
      }) ?? [],
  );
  const originalLines = useRef(lines.map((line) => ({ ...line })));
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Keep identities after a partial network failure so retry never creates a second product/insumo.
  const savedId = useRef<string | null>(product?.id ?? null);

  async function save() {
    if (!token || busy || categoryBusy) return;
    setError("");
    const normalizedPrice = decimalInput(amount);
    if (!name.trim() || !/^\d{1,8}(\.\d{1,2})?$/.test(normalizedPrice)) {
      setError(
        "Completá el nombre y un precio válido, con hasta dos decimales.",
      );
      return;
    }
    if (
      trackStock &&
      mode === "recipe" &&
      (!lines.length ||
        lines.some(
          (line) =>
            !line.id ||
            !/^\d+(\.\d{1,3})?$/.test(decimalInput(line.yield)) ||
            new Decimal(decimalInput(line.yield)).lte(0),
        ))
    ) {
      setError("Elegí al menos un insumo e indicá cuánto rinde cada envase.");
      return;
    }
    if (
      trackStock &&
      mode === "recipe" &&
      new Set(lines.map((line) => line.id)).size !== lines.length
    ) {
      setError("Cada insumo debe aparecer una sola vez en la receta.");
      return;
    }
    setBusy(true);
    try {
      let recipes: {
        inventoryItemId: string;
        quantityUsed?: string;
        yieldPerPackage?: string;
      }[] = [];
      let effectiveSaleType = saleType;
      if (!trackStock && product) {
        // Editing a menu without stock must not erase the shared catalog recipe.
        recipes = product.recipes.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          quantityUsed: line.quantityUsed,
        }));
      } else if (trackStock && mode === "unit") {
        effectiveSaleType = "GLASS";
      } else if (trackStock && mode === "recipe") {
        recipes = lines.map((line) => {
          const original = originalLines.current.find(
            (row) => row.id === line.id,
          );
          if (
            original &&
            original.yield === line.yield &&
            saleType === product?.saleType
          ) {
            return {
              inventoryItemId: line.id,
              quantityUsed: original.quantity,
            };
          }
          const yld = new Decimal(decimalInput(line.yield));
          // A whole-package product stores package counts, servings store base units.
          return saleType === "BOTTLE"
            ? {
                inventoryItemId: line.id,
                quantityUsed: new Decimal(1)
                  .div(yld)
                  .toDecimalPlaces(4)
                  .toString(),
              }
            : { inventoryItemId: line.id, yieldPerPackage: yld.toString() };
        });
      }
      const body = {
        name: name.trim(),
        price: product?.price ?? normalizedPrice,
        categoryId,
        saleType: effectiveSaleType,
        recipes,
      };
      if (savedId.current)
        await apiFetch(`/inventory/products/${savedId.current}`, {
          method: "PUT",
          token,
          body: JSON.stringify(body),
        });
      else {
        const result = await apiFetch<{ product: ApiProduct }>(
          "/inventory/products",
          { method: "POST", token, body: JSON.stringify(body) },
        );
        savedId.current = result.product.id;
      }
      await apiFetch(`/bars/${barId}/products/toggle`, {
        method: "POST",
        token,
        body: JSON.stringify({ productId: savedId.current, isActive: true }),
      });
      await apiFetch(`/events/${eventId}/products/set-override`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          productId: savedId.current,
          priceOverride: normalizedPrice,
        }),
      });
      if (trackStock && ((mode === "unit" && directStock == null) || (mode === "none" && directStock != null))) {
        await apiFetch(`/bars/${barId}/product-stock`, {
          method: "PUT",
          token,
          body: JSON.stringify({
            productId: savedId.current,
            quantity: mode === "unit" ? (directStock ?? "0") : null,
            expectedCurrentStock: directStock ?? null,
          }),
        });
      }
      onSaved(savedId.current, trackStock && mode !== "none");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo guardar. Podés volver a intentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="bw-product-editor"
      aria-label={product ? "Editar producto" : "Nuevo producto"}
    >
      <button className="bw-back" disabled={busy} onClick={onCancel}>
        <ArrowLeft size={16} />
        Volver al menú
      </button>
      <div className="bw-heading">
        <div>
          <h3>{product ? "Editar producto" : "Nuevo producto"}</h3>
          {product && (
            <p>Nombre, categoría y receta compartidos en tu catálogo.</p>
          )}
        </div>
      </div>
      <div className="bw-fields">
        <label htmlFor={`${id}-name`}>
          Nombre del producto
          <input
            autoFocus
            id={`${id}-name`}
            value={name}
            disabled={busy}
            maxLength={255}
            placeholder="Ej. Fernet con cola"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label htmlFor={`${id}-price`}>
          Precio de venta en este evento
          <span className="bw-price-input">
            <span>$</span>
            <input
              id={`${id}-price`}
              inputMode="decimal"
              value={amount}
              disabled={busy}
              placeholder="0"
              onChange={(e) => setAmount(e.target.value)}
            />
          </span>
        </label>
      </div>
      <ProductCategoryField
        token={token}
        value={categoryId}
        onChange={setCategoryId}
        disabled={busy}
        onBusyChange={setCategoryBusy}
      />
      {trackStock && (
        <fieldset className="bw-stock-choice" disabled={busy}>
          <legend>¿Cómo controlás el stock?</legend>
          <div className="bw-choice-grid">
            {(
              [
                {
                  value: "unit",
                  title: "Por unidad",
                  detail: "Latas, comidas o productos listos para vender.",
                },
                {
                  value: "recipe",
                  title: "Con insumos",
                  detail: "Tragos y combos que consumen uno o más insumos.",
                },
                {
                  value: "none",
                  title: "Sin control",
                  detail: "Servicios o productos sin límite de existencias.",
                },
              ] as const
            ).map((choice) => (
              <label
                key={choice.value}
                className={
                  mode === choice.value ? "bw-choice selected" : "bw-choice"
                }
              >
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={choice.value}
                  checked={mode === choice.value}
                  onChange={() => setMode(choice.value)}
                />
                <span>
                  <strong>{choice.title}</strong>
                  <small>{choice.detail}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {trackStock && mode === "unit" && (
        <div className="bw-unit-preview">
          <strong>1 {name.trim() || "producto"} vendido</strong>
          <span>descuenta 1 unidad del stock de esta barra</span>
        </div>
      )}
      {trackStock && mode === "recipe" && (
        <section className="bw-recipe-editor">
          <div className="bw-heading">
            <div>
              <h4>Insumos por producto</h4>
            </div>
            <label className="bw-inline-label">
              Venta
              <select
                value={saleType}
                disabled={busy}
                onChange={(e) => setSaleType(e.target.value as typeof saleType)}
              >
                <option value="GLASS">Por unidad / porción</option>
                <option value="BOTTLE">Por botella / combo</option>
              </select>
            </label>
          </div>
          {lines.map((line, index) => {
            const item = materials.find((material) => material.id === line.id);
            return (
              <div className="bw-recipe-line" key={index}>
                <label htmlFor={`${id}-item-${index}`}>
                  Insumo
                  <select
                    id={`${id}-item-${index}`}
                    value={line.id}
                    disabled={busy}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, id: e.target.value } : row,
                        ),
                      )
                    }
                  >
                    <option value="">Elegí un insumo</option>
                    {materials
                      .filter(
                        (mat) =>
                          mat.id === line.id ||
                          !lines.some((row) => row.id === mat.id),
                      )
                      .map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.name} · {packageDescription(mat)}
                        </option>
                      ))}
                  </select>
                </label>
                <label htmlFor={`${id}-yield-${index}`}>
                  1 {item ? singularStockUnit(item) : "envase"} rinde
                  <input
                    id={`${id}-yield-${index}`}
                    inputMode="decimal"
                    value={line.yield}
                    disabled={busy}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, yield: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <span className="bw-yield-label">
                  {name.trim() || "productos"}
                </span>
                <button
                  className="bw-icon-button"
                  disabled={busy}
                  aria-label={`Quitar insumo ${item?.name ?? index + 1}`}
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <X size={17} />
                </button>
              </div>
            );
          })}
          {!lines.length && (
            <p className="bw-muted">
              Elegí los ingredientes que se descuentan con cada venta.
            </p>
          )}
          <div className="bw-form-actions">
            <button
              className="bw-secondary"
              disabled={busy || creatingMaterial}
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { id: "", yield: "1", quantity: "1" },
                ])
              }
            >
              <Plus size={16} />
              Agregar insumo existente
            </button>
            <button
              className="bw-text-button"
              disabled={busy}
              onClick={() => setCreatingMaterial(true)}
            >
              Crear insumo
            </button>
          </div>
          {creatingMaterial && (
            <BarMaterialForm
              token={token}
              materials={materials}
              onCancel={() => setCreatingMaterial(false)}
              onCreated={(item) => {
                onMaterialsChange(item);
                setLines((prev) => {
                  const index = prev.findIndex((line) => !line.id);
                  return index < 0
                    ? [...prev, { id: item.id, yield: "1", quantity: "1" }]
                    : prev.map((line, i) =>
                        i === index
                          ? { id: item.id, yield: "1", quantity: "1" }
                          : line,
                      );
                });
                setCreatingMaterial(false);
              }}
            />
          )}
        </section>
      )}
      {product && (
        <details className="bw-image-details">
          <summary>Imagen del producto</summary>
          <ProductImageUploader
            product={{
              id: product.id,
              name: product.name,
              imageUrl: product.imageUrl,
            }}
            onUpdated={() => {}}
          />
        </details>
      )}
      {error && (
        <p role="alert" className="bw-error">
          {error}
        </p>
      )}
      <div className="bw-editor-footer">
        <button className="bw-secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="bw-primary"
          disabled={
            busy ||
            categoryBusy ||
            !name.trim() ||
            !amount.trim() ||
            creatingMaterial
          }
          onClick={() => void save()}
        >
          {busy
            ? "Guardando…"
            : product
              ? "Guardar producto"
              : "Crear y agregar al menú"}
        </button>
      </div>
      {trackStock &&
        mode === "recipe" &&
        lines.some((line) => Number(line.yield) > 1) && (
          <p className="bw-muted">
            Rendimiento por insumo:{" "}
            {lines
              .filter((line) => line.id)
              .map(
                (line) =>
                  `${materials.find((m) => m.id === line.id)?.name}: ${quantityLabel(decimalInput(line.yield) || "0")}`,
              )
              .join(" · ")}
          </p>
        )}
    </section>
  );
}
