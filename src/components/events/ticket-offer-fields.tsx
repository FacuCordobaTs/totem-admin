// Oferta comercial de un tipo de entrada. Espeja backend/src/lib/ticket-pricing.ts:
// un tipo tiene a lo sumo una estrategia — promo "llevás X, pagás Y" o descuentos
// escalonados por cantidad — y el backend valida y cotiza con las mismas reglas.
import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type VolumeDiscountTier = { minQuantity: number; percentOff: number }

export type TicketOfferSource = {
  promoBuy?: number | null
  promoPay?: number | null
  volumeDiscounts?: VolumeDiscountTier[] | null
}

type TierDraft = { minQuantity: string; percentOff: string }

export type TicketOfferDraft =
  | { kind: "none" }
  | { kind: "bundle"; buy: string; pay: string }
  | { kind: "volume"; tiers: TierDraft[] }

const MAX_TIERS = 5
const DEFAULT_BUNDLE = { buy: "2", pay: "1" }
const DEFAULT_TIERS: TierDraft[] = [
  { minQuantity: "5", percentOff: "10" },
  { minQuantity: "10", percentOff: "15" },
  { minQuantity: "20", percentOff: "20" },
]

export function offerDraftFrom(type?: TicketOfferSource): TicketOfferDraft {
  if (type?.volumeDiscounts?.length) {
    return {
      kind: "volume",
      tiers: type.volumeDiscounts.map((t) => ({
        minQuantity: String(t.minQuantity),
        percentOff: String(t.percentOff),
      })),
    }
  }
  if (type?.promoBuy != null && type.promoPay != null) {
    return { kind: "bundle", buy: String(type.promoBuy), pay: String(type.promoPay) }
  }
  return { kind: "none" }
}

type OfferPayload = {
  promoBuy: number | null
  promoPay: number | null
  volumeDiscounts: VolumeDiscountTier[] | null
}

/** Convierte el borrador al cuerpo de la API, o devuelve el error a mostrar. */
export function offerPayload(draft: TicketOfferDraft): { payload: OfferPayload } | { error: string } {
  const none: OfferPayload = { promoBuy: null, promoPay: null, volumeDiscounts: null }
  if (draft.kind === "none") return { payload: none }
  if (draft.kind === "bundle") {
    const buy = Number(draft.buy)
    const pay = Number(draft.pay)
    if (!Number.isInteger(buy) || !Number.isInteger(pay) || buy < 2 || buy > 20 || pay < 1 || pay >= buy) {
      return { error: "Revisá la promoción: llevás entre 2 y 20, y pagás una cantidad menor." }
    }
    return { payload: { ...none, promoBuy: buy, promoPay: pay } }
  }
  const tiers = draft.tiers
    .map((t) => ({ minQuantity: Number(t.minQuantity), percentOff: Number(t.percentOff) }))
    .sort((a, b) => a.minQuantity - b.minQuantity)
  if (tiers.length === 0) return { error: "Agregá al menos un escalón de descuento." }
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    if (!Number.isInteger(t.minQuantity) || t.minQuantity < 2 || t.minQuantity > 1000) {
      return { error: "Cada escalón empieza en una cantidad entera entre 2 y 1000 entradas." }
    }
    if (!Number.isInteger(t.percentOff) || t.percentOff < 1 || t.percentOff > 90) {
      return { error: "Cada descuento es un porcentaje entero entre 1% y 90%." }
    }
    const prev = tiers[i - 1]
    if (prev && (t.minQuantity === prev.minQuantity || t.percentOff <= prev.percentOff)) {
      return { error: "Cada escalón debe pedir más entradas y dar más descuento que el anterior." }
    }
  }
  return { payload: { ...none, volumeDiscounts: tiers } }
}

/** Etiqueta compacta para el listado: "2×1" o "5+ −10%". */
export function offerBadge(type: TicketOfferSource): string | null {
  if (type.volumeDiscounts?.length) {
    const first = type.volumeDiscounts[0]
    const more = type.volumeDiscounts.length > 1 ? ` · ${type.volumeDiscounts.length} escalones` : ""
    return `${first.minQuantity}+ −${first.percentOff}%${more}`
  }
  if (type.promoBuy != null && type.promoPay != null) return `${type.promoBuy}×${type.promoPay}`
  return null
}

const KIND_OPTIONS: { kind: TicketOfferDraft["kind"]; label: string }[] = [
  { kind: "none", label: "Sin oferta" },
  { kind: "bundle", label: "Llevás X, pagás Y" },
  { kind: "volume", label: "Descuento por cantidad" },
]

export function TicketOfferFields({
  id,
  value,
  onChange,
  inputClassName,
}: {
  id: string
  value: TicketOfferDraft
  onChange: (next: TicketOfferDraft) => void
  inputClassName: string
}) {
  function selectKind(kind: TicketOfferDraft["kind"]) {
    if (kind === value.kind) return
    if (kind === "none") onChange({ kind })
    else if (kind === "bundle") onChange({ kind, ...DEFAULT_BUNDLE })
    else onChange({ kind, tiers: DEFAULT_TIERS })
  }

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label="Tipo de oferta"
        className="inline-flex flex-wrap gap-1 rounded-xl bg-white/[0.04] p-1"
      >
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={value.kind === o.kind}
            onClick={() => selectKind(o.kind)}
            className={cn(
              "h-9 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9500]",
              value.kind === o.kind ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {value.kind === "bundle" ? <BundleFields id={id} value={value} onChange={onChange} inputClassName={inputClassName} /> : null}
      {value.kind === "volume" ? <VolumeFields id={id} value={value} onChange={onChange} inputClassName={inputClassName} /> : null}
      {value.kind === "none" ? (
        <p className="text-[12px] text-white/45">Todas las entradas de este tipo se cobran a precio lleno.</p>
      ) : null}
    </div>
  )
}

function BundleFields({
  id,
  value,
  onChange,
  inputClassName,
}: {
  id: string
  value: Extract<TicketOfferDraft, { kind: "bundle" }>
  onChange: (next: TicketOfferDraft) => void
  inputClassName: string
}) {
  const buy = Number(value.buy)
  const pay = Number(value.pay)
  const percent = buy > pay && buy > 0 ? Math.round((1 - pay / buy) * 100) : null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:max-w-[280px]">
        <label className="grid gap-2 text-[13px] font-medium text-white/80" htmlFor={`type-buy-${id}`}>
          Llevás
          <Input
            id={`type-buy-${id}`}
            inputMode="numeric"
            value={value.buy}
            onChange={(e) => onChange({ ...value, buy: e.target.value })}
            className={cn(inputClassName, "tabular-nums")}
          />
        </label>
        <label className="grid gap-2 text-[13px] font-medium text-white/80" htmlFor={`type-pay-${id}`}>
          Pagás
          <Input
            id={`type-pay-${id}`}
            inputMode="numeric"
            value={value.pay}
            onChange={(e) => onChange({ ...value, pay: e.target.value })}
            className={cn(inputClassName, "tabular-nums")}
          />
        </label>
      </div>
      <p className="text-[12px] text-white/50" aria-live="polite">
        {percent != null
          ? `Llevando ${value.buy} pagás ${value.pay}: ${percent}% menos.`
          : "Llevás entre 2 y 20 entradas y pagás una cantidad menor."}
      </p>
    </div>
  )
}

function VolumeFields({
  id,
  value,
  onChange,
  inputClassName,
}: {
  id: string
  value: Extract<TicketOfferDraft, { kind: "volume" }>
  onChange: (next: TicketOfferDraft) => void
  inputClassName: string
}) {
  const setTier = (index: number, patch: Partial<TierDraft>) =>
    onChange({ ...value, tiers: value.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)) })
  const removeTier = (index: number) =>
    onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })
  const addTier = () => {
    const last = value.tiers[value.tiers.length - 1]
    const next = last
      ? { minQuantity: String((Number(last.minQuantity) || 0) * 2 || 5), percentOff: String(Math.min(90, (Number(last.percentOff) || 0) + 5)) }
      : DEFAULT_TIERS[0]
    onChange({ ...value, tiers: [...value.tiers, next] })
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-white/45">
        Se aplica el escalón más alto que alcance la compra, sobre todas las entradas de este tipo.
      </p>
      <ol className="space-y-2">
        {value.tiers.map((tier, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[13px] text-white/50">Desde</span>
            <Input
              aria-label={`Escalón ${index + 1}: cantidad mínima de entradas`}
              id={index === 0 ? `type-volume-${id}` : undefined}
              inputMode="numeric"
              value={tier.minQuantity}
              onChange={(e) => setTier(index, { minQuantity: e.target.value })}
              className={cn(inputClassName, "w-20 tabular-nums")}
            />
            <span className="shrink-0 text-[13px] text-white/50">entradas,</span>
            <div className="relative">
              <Input
                aria-label={`Escalón ${index + 1}: porcentaje de descuento`}
                inputMode="numeric"
                value={tier.percentOff}
                onChange={(e) => setTier(index, { percentOff: e.target.value })}
                className={cn(inputClassName, "w-20 pr-7 tabular-nums")}
              />
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-white/35">
                %
              </span>
            </div>
            <span className="shrink-0 text-[13px] text-white/50">off</span>
            <button
              type="button"
              onClick={() => removeTier(index)}
              aria-label={`Quitar escalón ${index + 1}`}
              className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF9500]"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      {value.tiers.length < MAX_TIERS ? (
        <button
          type="button"
          onClick={addTier}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF9500]"
        >
          <Plus className="h-4 w-4" />
          Agregar escalón
        </button>
      ) : null}
    </div>
  )
}
