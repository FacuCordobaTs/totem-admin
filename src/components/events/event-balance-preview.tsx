import { useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import Decimal from "decimal.js"
import { cn } from "@/lib/utils"
import type { EventClosingReport } from "@/types/events"
import { PAYMENT_LABELS } from "@/lib/printerUtils"
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react"

/** Simulación del balance actual con conteos de insumos y efectivo. No persiste conteos. */

type ClosingInsumo = {
  inventoryItemId: string
  name: string
  countingUnit: string
  estimated: number
  purchased: number
  unitCost: string
  purchasedCost: string
}

/** Caja esperada de un puesto/barra (tarea 10.1). `barId` null = caja de puerta. */
type CashBarPrep = {
  barId: string | null
  barName: string
  expected: string
  byMethod: { method: string; expected: string }[]
}

type ClosingPrep = {
  income: { tickets: string; bar: string; gross: string }
  expenses: { operational: string; merchandisePurchased: string }
  cash: { expected: string; hasCashSales: boolean }
  cashes: CashBarPrep[]
  /** Tarea 10.2 — Pendiente de entrega: vendido y no retirado (plata cobrada que se debe). */
  pendingDelivery?: { quantity: number; amount: string }
  insumos: ClosingInsumo[]
  report: EventClosingReport | null
}

function money(value: Decimal.Value | null | undefined): string {
  if (value == null) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function numFmt(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded.toLocaleString("es-AR", { maximumFractionDigits: 2 })
}

type Preview = {
  consumed: Decimal
  leftover: Decimal
  mermaValue: Decimal
  gross: Decimal
  operational: Decimal
  netReal: Decimal
  netProjected: Decimal
}

function decimalInput(raw: string): Decimal {
  try {
    const value = new Decimal(raw.trim().replace(",", "."))
    return value.isFinite() && value.gte(0) ? value : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}

type Props = {
  eventId: string
  eventName: string
  supportsConsumptions?: boolean
  trackStock?: boolean
  onCancel: () => void
}

export function EventBalancePreview({
  eventId,
  eventName,
  supportsConsumptions = true,
  trackStock = true,
  onCancel,
}: Props) {
  const token = useAuthStore((s) => s.token)
  const [prep, setPrep] = useState<ClosingPrep | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [counts, setCounts] = useState<Record<string, string>>({})
  // Tarea 10.1 — Contado manual por puesto/barra (key = `barId ?? ""` para la caja de puerta).
  const [cashCounts, setCashCounts] = useState<Record<string, string>>({})
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void apiFetch<ClosingPrep>(`/events/${eventId}/closing`, {
      method: "GET",
      token,
    })
      .then((data) => {
        if (cancelled) return
        setPrep(data)
        setLoadError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setLoadError(e instanceof ApiError ? e.message : "No se pudo cargar el balance")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, eventId])

  // Los pasos son dinámicos: la caja solo aparece si hay puestos con efectivo esperado
  // (tarea 10.1 — cada puesto con caja física tiene su conteo).
  const steps = useMemo<("conteo" | "caja" | "resultado")[]>(() => {
    const s: ("conteo" | "caja" | "resultado")[] = trackStock ? ["conteo"] : []
    if ((prep?.cashes.length ?? 0) > 0) s.push("caja")
    s.push("resultado")
    return s
  }, [prep?.cashes.length, trackStock])

  const step = steps[Math.min(stepIdx, steps.length - 1)]

  // Simulación local a partir de las cifras actuales consultadas al backend.
  const preview = useMemo(() => {
    if (!prep) return null
    let consumed = new Decimal(0)
    let leftover = new Decimal(0)
    let mermaValue = new Decimal(0)
    for (const item of prep.insumos) {
      const raw = counts[item.inventoryItemId]
      const counted = raw?.trim() ? decimalInput(raw) : new Decimal(item.estimated)
      const unitCost = new Decimal(item.unitCost)
      const itemLeftover = Decimal.min(counted, item.purchased).times(unitCost)
      consumed = consumed.plus(Decimal.max(0, new Decimal(item.purchasedCost).minus(itemLeftover)))
      leftover = leftover.plus(itemLeftover)
      mermaValue = mermaValue.plus(Decimal.max(0, new Decimal(item.estimated).minus(counted)).times(unitCost))
    }
    const gross = new Decimal(prep.income.gross)
    const operational = new Decimal(prep.expenses.operational)
    const netReal = gross.minus(operational).minus(consumed)
    const netProjected = gross.minus(operational).minus(prep.expenses.merchandisePurchased)
    return { consumed, leftover, mermaValue, gross, operational, netReal, netProjected }
  }, [prep, counts])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
      </div>
    )
  }

  if (loadError || !prep || !preview) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-[15px] text-red-400/80">{loadError ?? "Sin datos"}</p>
        <Button
          variant="ghost"
          onClick={onCancel}
          className="mt-6 text-white/60 hover:text-white"
        >
          Volver
        </Button>
      </div>
    )
  }

  const isLast = stepIdx >= steps.length - 1

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-white">Balance de {eventName}</h2>
        <p className="mt-2 text-[14px] text-white/60">
          Probá los conteos para calcular el resultado. Los conteos no se guardan.
        </p>
        <div className="mt-3 flex items-center gap-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= stepIdx ? "bg-[#FF9500]" : "bg-white/[0.10]"
              )}
            />
          ))}
        </div>
      </div>

      {step === "conteo" && (
        <StepConteo insumos={prep.insumos} counts={counts} setCounts={setCounts} />
      )}

      {step === "caja" && (
        <StepCajas
          cashes={prep.cashes}
          counts={cashCounts}
          onChange={(key, v) =>
            setCashCounts((prev) => ({ ...prev, [key]: v }))
          }
        />
      )}

      {step === "resultado" && (
        <StepResultado
          preview={preview}
          cashes={prep.cashes}
          cashCounts={cashCounts}
          pending={prep.pendingDelivery}
          supportsConsumptions={supportsConsumptions}
          trackStock={trackStock}
        />
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (stepIdx === 0 ? onCancel() : setStepIdx((i) => i - 1))}
          className="gap-2 text-white/50 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {stepIdx === 0 ? "Volver al evento" : "Atrás"}
        </Button>

        {isLast ? (
          <Button
            type="button"
            onClick={onCancel}
            className="h-11 gap-2 bg-[#FF9500] px-6 text-[15px] font-semibold text-black hover:bg-[#FF9500]/90"
          >
            <Check className="h-4 w-4" />
            Volver al evento
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => setStepIdx((i) => i + 1)}
            className="h-11 gap-2 bg-white/[0.10] px-6 text-[15px] font-semibold text-white hover:bg-white/[0.16]"
          >
            Siguiente
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function StepConteo({
  insumos,
  counts,
  setCounts,
}: {
  insumos: ClosingInsumo[]
  counts: Record<string, string>
  setCounts: (fn: (prev: Record<string, string>) => Record<string, string>) => void
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-white">
        ¿Cuánto quedó?
      </h2>
      <p className="mt-1.5 text-[14px] text-white/40">
        Contá lo que sobró de cada insumo. Al lado está lo que el sistema estima.
      </p>

      {insumos.length === 0 ? (
        <p className="mt-8 text-[14px] text-white/40">
          No hay insumos con stock para contar. Seguí al resultado.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-white/[0.06]">
          {insumos.map((i) => (
            <li key={i.inventoryItemId} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-medium text-white">{i.name}</p>
                <p className="text-[13px] text-white/35">
                  el sistema estima ~{numFmt(i.estimated)} {i.countingUnit}
                </p>
              </div>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Sobrante de ${i.name}`}
                value={counts[i.inventoryItemId] ?? ""}
                onChange={(e) =>
                  setCounts((prev) => ({
                    ...prev,
                    [i.inventoryItemId]: e.target.value,
                  }))
                }
                placeholder={numFmt(i.estimated)}
                className="h-16 w-28 shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.03] text-center text-3xl font-bold tabular-nums text-white outline-none placeholder:text-white/20 focus:border-[#FF9500]/60"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Tarea 10.1 — Conteo de caja POR PUESTO: una tarjeta por barra con caja (efectivo esperado,
 * desglose por método y el input del contado manual del cajero). "Si falta, se ve dónde."
 */
function StepCajas({
  cashes,
  counts,
  onChange,
}: {
  cashes: CashBarPrep[]
  counts: Record<string, string>
  onChange: (key: string, v: string) => void
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-white">Las cajas</h2>
      <p className="mt-1.5 text-[14px] text-white/40">
        Contá el efectivo de cada puesto. Al lado está lo que el sistema espera.
      </p>

      {cashes.length === 0 ? (
        <p className="mt-8 text-[14px] text-white/40">
          No hay cajas con efectivo para contar. Seguí al resultado.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {cashes.map((bar) => {
            const key = bar.barId ?? ""
            const otherMethods = bar.byMethod.filter(
              (m) => m.method !== "CASH"
            )
            return (
              <li
                key={key}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-white">
                      {bar.barName}
                    </p>
                    <p className="mt-0.5 text-[13px] text-white/40">
                      se esperaba{" "}
                      <span className="font-semibold tabular-nums text-white/70">
                        {money(bar.expected)}
                      </span>{" "}
                      en efectivo
                    </p>
                    {otherMethods.length > 0 && (
                      <p className="mt-1.5 text-[12px] text-white/30">
                        {otherMethods
                          .map(
                            (m) =>
                              `${PAYMENT_LABELS[m.method] ?? m.method} ${money(m.expected)}`
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={counts[key] ?? ""}
                    onChange={(e) => onChange(key, e.target.value)}
                    placeholder="0"
                    aria-label={`Efectivo contado en ${bar.barName}`}
                    className="h-16 w-32 shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.03] text-center text-3xl font-bold tabular-nums text-white outline-none placeholder:text-white/20 focus:border-[#FF9500]/60"
                  />
                </div>
                <p className="mt-2 text-right text-[12px] text-white/30">
                  ¿cuánto contaste?
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StepResultado({
  preview,
  cashes,
  cashCounts,
  pending,
  supportsConsumptions,
  trackStock,
}: {
  preview: Preview
  cashes: CashBarPrep[]
  cashCounts: Record<string, string>
  /** Tarea 10.2 — Pendiente de entrega: tragos vendidos y no retirados. */
  pending?: { quantity: number; amount: string }
  supportsConsumptions: boolean
  trackStock: boolean
}) {
  // Tarea 10.1 — Diferencia contado − esperado POR PUESTO ("si falta, se ve dónde").
  const cashRows = cashes.map((bar) => {
    const raw = cashCounts[bar.barId ?? ""]
    const counted =
      raw != null && raw.trim() !== ""
        ? decimalInput(raw)
        : null
    const expected = new Decimal(bar.expected)
    return {
      bar,
      expected,
      counted,
      diff: counted != null ? counted.minus(expected) : null,
    }
  })
  const anyCounted = cashRows.some((r) => r.counted != null)

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-white">El resultado</h2>
      <p className="mt-1.5 text-[14px] text-white/40">
        La liquidación de la noche, real contra proyectado.
      </p>

      {/* Neto real vs proyectado, lado a lado */}
      <div className="mt-8 grid grid-cols-1 gap-px sm:grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="bg-black/40 px-5 py-6 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
            resultado real
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-bold tabular-nums sm:text-4xl",
              preview.netReal.gte(0) ? "text-emerald-300" : "text-red-300"
            )}
          >
            {money(preview.netReal)}
          </p>
        </div>
        <div className="bg-black/40 px-5 py-6 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
            proyectado
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-white/45 sm:text-4xl">
            {money(preview.netProjected)}
          </p>
        </div>
      </div>

      <dl className="mt-8 space-y-2.5 text-[15px]">
        <Row label={supportsConsumptions ? "Entradas + barra (ingresos)" : "Entradas (ingresos)"} value={money(preview.gross)} />
        <Row label="Gastos operativos" value={`− ${money(preview.operational)}`} muted />
        {trackStock ? <Row
          label="Mercadería consumida"
          value={`− ${money(preview.consumed)}`}
          muted
        /> : null}
        <div className="border-t border-white/[0.08] pt-2.5">
          <Row label="Resultado neto" value={money(preview.netReal)} strong />
        </div>
      </dl>

      {/* Sobrante valuado + merma */}
      {trackStock ? <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.1em] text-white/30">
            sobrante en stock
          </p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-white">
            {money(preview.leftover)}
          </p>
          <p className="text-[12px] text-white/35">valor del stock sin consumir</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.1em] text-white/30">merma</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-white">
            {money(preview.mermaValue)}
          </p>
          <p className="text-[12px] text-white/35">diferencia estimado − contado</p>
        </div>
      </div> : null}

      {/* Tarea 10.2 — Pendiente de entrega: "Vendiste $X en tragos que nadie retiró (N)". Es
          plata cobrada que todavía se debe; se muestra en el balance. */}
      {supportsConsumptions && pending != null && pending.quantity > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200/25 bg-amber-200/[0.05] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.1em] text-amber-200/60">
            pendiente de entrega
          </p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-amber-200">
            Vendiste {money(pending.amount)} en tragos que nadie retiró ({pending.quantity})
          </p>
          <p className="text-[12px] text-white/35">
            plata cobrada que todavía se debe — queda pendiente hasta su retiro
          </p>
        </div>
      )}

      {cashRows.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12px] uppercase tracking-[0.1em] text-white/30">
            cajas por puesto
          </p>
          <ul className="mt-2 space-y-2">
            {cashRows.map(({ bar, expected, counted, diff }) => (
              <li
                key={bar.barId ?? ""}
                className="flex items-center justify-between gap-3 text-[14px]"
              >
                <span className="text-white/60">{bar.barName}</span>
                <span className="tabular-nums text-white/35">
                  esperado {money(expected)}
                </span>
                {counted != null && diff != null ? (
                  <span
                    className={cn(
                      "w-28 text-right font-semibold tabular-nums",
                      diff.abs().lt("0.005")
                        ? "text-emerald-300"
                        : diff.gt(0)
                          ? "text-amber-200"
                          : "text-red-300"
                    )}
                  >
                    {diff.isZero()
                      ? "Cuadra"
                      : `${diff.gt(0) ? "+" : ""}${money(diff)}`}
                  </span>
                ) : (
                  <span className="text-[12px] text-white/25">sin contar</span>
                )}
              </li>
            ))}
          </ul>
          {anyCounted && (
            <p className="mt-2 text-[12px] text-white/35">
              contado − esperado por puesto
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-white/45", strong && "font-semibold text-white/80")}>
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums text-white/70",
          muted && "text-white/40",
          strong && "text-[17px] font-bold text-white"
        )}
      >
        {value}
      </dd>
    </div>
  )
}
