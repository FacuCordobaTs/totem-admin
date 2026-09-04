import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EventClosingReport } from "@/types/events"
import { usePrinter } from "@/context/PrinterContext"
import {
  commandsToBytes,
  formatResumenCaja,
  PAYMENT_LABELS,
} from "@/lib/printerUtils"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react"

/**
 * Ceremonia de cierre (tarea 4.4 / spec §5 "Cierre") — el ÚNICO flujo por pasos de la app.
 * Tres pasos: (1) conteo de insumos con teclado numérico y la estimación del sistema al lado;
 * (2) caja POR PUESTO (tarea 10.1, visión §2.8: "cómo cerró cada caja" — esperado por método
 * y contado manual por cajero, solo si hubo efectivo); (3) liquidación automática, con el
 * resultado real (mercadería CONSUMIDA, no comprada) al lado del proyectado. Al confirmar,
 * `POST /:id/closing` recalcula del lado servidor, congela el reporte, cierra el evento e
 * imprime el resumen de caja de cada puesto (`formatResumenCaja`).
 */

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

/** Respuesta del POST de cierre: reporte + ventas por puesto para imprimir. */
type ClosingResponse = {
  event: unknown
  report: EventClosingReport
  barSales: {
    barId: string | null
    barName: string
    sales: {
      paymentMethod: "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER" | "SALDO"
      totalAmount: string
    }[]
  }[]
}

function money(value: string | number | null | undefined): string {
  if (value == null) return "—"
  const n = typeof value === "string" ? Number.parseFloat(value) : value
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
  consumed: number
  leftover: number
  mermaValue: number
  gross: number
  operational: number
  merchandisePurchased: number
  netReal: number
  netProjected: number
}

type Props = {
  eventId: string
  eventName: string
  supportsConsumptions?: boolean
  trackStock?: boolean
  onClosed: () => void
  onCancel: () => void
}

export function EventClosingCeremony({
  eventId,
  eventName,
  supportsConsumptions = true,
  trackStock = true,
  onClosed,
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
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { printRaw } = usePrinter()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
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
        setLoadError(e instanceof ApiError ? e.message : "No se pudo preparar el cierre")
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

  // Liquidación en vivo (preview cliente). El backend recalcula la versión autoritativa al POST.
  const preview = useMemo(() => {
    if (!prep) return null
    let consumed = 0
    let leftover = 0
    let mermaValue = 0
    const insumos = prep.insumos.map((i) => {
      const raw = counts[i.inventoryItemId]
      const counted =
        raw != null && raw.trim() !== ""
          ? Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0)
          : i.estimated
      const unitCost = Number.parseFloat(i.unitCost) || 0
      const purchasedCost = Number.parseFloat(i.purchasedCost) || 0
      const leftoverUnits = Math.min(counted, i.purchased)
      const itemLeftover = leftoverUnits * unitCost
      const itemConsumed = Math.max(0, purchasedCost - itemLeftover)
      const merma = i.estimated - counted
      const itemMerma = merma > 0 ? merma * unitCost : 0
      consumed += itemConsumed
      leftover += itemLeftover
      mermaValue += itemMerma
      return { ...i, counted, itemConsumed, itemLeftover, merma, itemMerma }
    })
    const gross = Number.parseFloat(prep.income.gross) || 0
    const operational = Number.parseFloat(prep.expenses.operational) || 0
    const merchandisePurchased =
      Number.parseFloat(prep.expenses.merchandisePurchased) || 0
    const netReal = gross - operational - consumed
    const netProjected = gross - operational - merchandisePurchased
    return {
      insumos,
      consumed,
      leftover,
      mermaValue,
      gross,
      operational,
      merchandisePurchased,
      netReal,
      netProjected,
    }
  }, [prep, counts])

  const submit = useCallback(async () => {
    if (!token || !prep) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body = {
        counts: prep.insumos.map((i) => {
          const raw = counts[i.inventoryItemId]
          const counted =
            raw != null && raw.trim() !== ""
              ? Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0)
              : i.estimated
          return { inventoryItemId: i.inventoryItemId, counted }
        }),
        // Tarea 10.1 — Conteo por puesto: cada barra con su contado (null = no se contó).
        cashes: prep.cashes.map((bar) => {
          const raw = cashCounts[bar.barId ?? ""]
          return {
            barId: bar.barId,
            counted:
              raw != null && raw.trim() !== ""
                ? Number.parseFloat(raw.replace(",", ".")) || 0
                : null,
          }
        }),
      }
      const res = await apiFetch<ClosingResponse>(`/events/${eventId}/closing`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })

      // Tarea 10.1 — Al confirmar se imprime el resumen de caja de cada puesto con caja
      // (`formatResumenCaja`). La impresión es best-effort: el evento ya quedó cerrado.
      for (const bar of res.barSales ?? []) {
        if (bar.sales.length === 0) continue
        try {
          await printRaw(
            commandsToBytes(
              formatResumenCaja(
                bar.sales.map((s) => ({
                  totalAmount: s.totalAmount,
                  paymentMethod: s.paymentMethod,
                })),
                bar.barName,
                eventName
              )
            )
          )
        } catch (err) {
          toast.error(
            `Resumen de ${bar.barName}: ${
              err instanceof Error ? err.message : "no se pudo imprimir"
            }`
          )
        }
      }

      onClosed()
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "No se pudo cerrar el evento")
      setSubmitting(false)
    }
  }, [token, prep, counts, cashCounts, eventId, onClosed, printRaw, eventName])

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
        <p className="text-[12px] uppercase tracking-[0.2em] text-white/30">
          {eventName} · cierre
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

      {submitError && (
        <p className="mt-6 text-center text-[13px] text-red-400/80">{submitError}</p>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() => (stepIdx === 0 ? onCancel() : setStepIdx((i) => i - 1))}
          className="gap-2 text-white/50 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {stepIdx === 0 ? "Cancelar" : "Atrás"}
        </Button>

        {isLast ? (
          <Button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="h-11 gap-2 bg-[#FF9500] px-6 text-[15px] font-semibold text-white hover:bg-[#FF9500]/90"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Cerrar el evento
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
        ? Number.parseFloat(raw.replace(",", ".")) || 0
        : null
    const expected = Number.parseFloat(bar.expected) || 0
    return {
      bar,
      expected,
      counted,
      diff: counted != null ? counted - expected : null,
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
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="bg-black/40 px-5 py-6 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
            resultado real
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-bold tabular-nums sm:text-4xl",
              preview.netReal >= 0 ? "text-emerald-300" : "text-red-300"
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
          <p className="text-[12px] text-white/35">viaja valuado al próximo evento</p>
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
          plata cobrada que todavía se debe; se congela en el reporte al confirmar. */}
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
                      Math.abs(diff) < 0.005
                        ? "text-emerald-300"
                        : diff > 0
                          ? "text-amber-200"
                          : "text-red-300"
                    )}
                  >
                    {diff === 0
                      ? "Cuadra"
                      : `${diff > 0 ? "+" : ""}${money(diff)}`}
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
