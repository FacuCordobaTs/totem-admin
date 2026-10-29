import { useId, useRef, useState } from "react";
import Decimal from "decimal.js";
import { ArrowLeft } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  ApiInventoryItem,
  ApiProduct,
  ProductSaleType,
} from "@/types/inventory";
import { ProductCategoryField } from "@/components/inventory/product-category-field";
import { ProductImageUploader } from "@/components/inventory/product-image-uploader";
import { BarRecipeDialog } from "./bar-recipe-dialog";
import {
  recipeDraftFromLines,
  recipeLinesForApi,
  type RecipeDraftLine,
  decimalInput,
  moneyLabel,
  priceInput,
  productSaleType,
  usesRecipe,
} from "./bar-workspace-model";

const SALE_CHOICES: { value: ProductSaleType; title: string; detail: string }[] = [
  {
    value: "GLASS",
    title: "Trago",
    detail: "Cada venta usa una parte de uno o más insumos.",
  },
  {
    value: "BOTTLE",
    title: "Botellas",
    detail: "Cada venta entrega botellas enteras de uno o más insumos.",
  },
  {
    value: "UNIT",
    title: "Unidad",
    detail: "Latas o comidas listas. También sirven de insumo para otros productos.",
  },
  {
    value: "NONE",
    title: "Sin control",
    detail: "Servicios o productos sin límite de existencias.",
  },
];

function pricesDiffer(a: string | undefined, b: string): boolean {
  if (a == null) return false;
  try {
    return !new Decimal(a).eq(b);
  } catch {
    return a !== b;
  }
}
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
  onRemove?: () => Promise<boolean>;
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
  onRemove,
  onSaved,
}: Props) {
  const id = useId();
  const [name, setName] = useState(product?.name ?? "");
  const initialPrice = price ?? product?.price ?? "";
  const [amount, setAmount] = useState(() => {
    try {
      return initialPrice ? priceInput(initialPrice) : "";
    } catch {
      return initialPrice;
    }
  });
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const initialSaleType: ProductSaleType = product
    ? productSaleType(product, directStock)
    : "UNIT";
  const [saleType, setSaleType] = useState<ProductSaleType>(initialSaleType);
  // Receta por modo: volver al modo original recupera lo guardado.
  const [drafts, setDrafts] = useState<Partial<Record<"GLASS" | "BOTTLE", RecipeDraftLine[]>>>(
    () =>
      product && usesRecipe(initialSaleType)
        ? { [initialSaleType]: recipeDraftFromLines(initialSaleType, product.recipes) }
        : {},
  );
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const busy = saving || removing;
  const recipe = usesRecipe(saleType) ? (drafts[saleType] ?? []) : [];
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
    setSaving(true);
    try {
      // Sin control de stock en el evento, se conserva lo que el catálogo ya tenía.
      const effectiveSaleType = trackStock
        ? saleType
        : (product?.saleType ?? "NONE");
      const recipes = trackStock
        ? usesRecipe(saleType)
          ? recipeLinesForApi(saleType, recipe)
          : []
        : (product?.recipes.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            ...(product.saleType === "BOTTLE"
              ? { quantityUsed: new Decimal(line.quantityUsed).round().toString() }
              : { yieldPerPackage: line.yieldPerPackage ?? undefined, quantityUsed: line.quantityUsed }),
          })) ?? []);
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
      onSaved(
        savedId.current,
        trackStock && (saleType === "UNIT" || recipe.length > 0),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo guardar. Podés volver a intentarlo.",
      );
    } finally {
      setSaving(false);
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
          {product && pricesDiffer(price, product.price) ? (
            <small className="bw-field-hint">
              En el catálogo: {moneyLabel(product.price)}
            </small>
          ) : null}
        </label>
      </div>
      <ProductCategoryField
        token={token}
        value={categoryId}
        onChange={setCategoryId}
        disabled={busy}
        onBusyChange={setCategoryBusy}
        appearance="workspace"
      />
      {trackStock && (
        <fieldset className="bw-stock-choice" disabled={busy}>
          <legend>¿Cómo se vende este producto?</legend>
          <div className="bw-choice-grid">
            {SALE_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className={
                  saleType === choice.value ? "bw-choice selected" : "bw-choice"
                }
              >
                <input
                  type="radio"
                  name={`${id}-sale-type`}
                  value={choice.value}
                  checked={saleType === choice.value}
                  onChange={() => setSaleType(choice.value)}
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
      {trackStock && saleType === "UNIT" && (
        <div className="bw-unit-preview">
          <strong>1 {name.trim() || "producto"} vendido</strong>
          <span>
            descuenta 1 unidad de su insumo «{name.trim() || "producto"}», que
            también podés usar en recetas
          </span>
        </div>
      )}
      {trackStock && usesRecipe(saleType) && (
        <div className="bw-recipe-summary">
          <div className="min-w-0">
            <strong>
              {saleType === "GLASS" ? "Receta" : "Botellas por venta"}
            </strong>
            <span title={recipe.map((line) => line.inventoryItemName).join(" + ")}>
              {recipe.length
                ? recipe
                    .map((line) =>
                      saleType === "BOTTLE"
                        ? `${line.value} × ${line.inventoryItemName}`
                        : line.inventoryItemName,
                    )
                    .join(" + ")
                : "Todavía sin configurar: se vende sin descontar stock."}
            </span>
          </div>
          <button
            type="button"
            className="bw-secondary"
            disabled={busy}
            onClick={() => setRecipeOpen(true)}
          >
            {saleType === "GLASS" ? "Configurar receta" : "Configurar botellas"}
          </button>
        </div>
      )}
      {recipeOpen && usesRecipe(saleType) && (
        <BarRecipeDialog
          open
          onOpenChange={setRecipeOpen}
          token={token}
          mode={saleType}
          productName={name}
          materials={materials}
          initialLines={recipe}
          onMaterialCreated={onMaterialsChange}
          onSave={(lines) => {
            setDrafts((prev) => ({ ...prev, [saleType]: lines }));
            setRecipeOpen(false);
            return true;
          }}
        />
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
        {product && onRemove && (
          <button
            type="button"
            className="bw-danger-text bw-remove-product"
            disabled={busy || categoryBusy}
            onClick={async () => {
              setRemoving(true);
              try {
                if (await onRemove()) onCancel();
              } finally {
                setRemoving(false);
              }
            }}
          >
            {removing ? "Quitando…" : "Quitar de esta barra"}
          </button>
        )}
        <button className="bw-secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="bw-primary"
          disabled={
            busy ||
            categoryBusy ||
            !name.trim() ||
            !amount.trim()
          }
          onClick={() => void save()}
        >
          {saving
            ? "Guardando…"
            : product
              ? "Guardar producto"
              : "Crear y agregar al menú"}
        </button>
      </div>
    </section>
  );
}
