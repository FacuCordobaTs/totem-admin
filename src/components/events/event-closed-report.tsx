import type { EventClosingReport } from "@/types/events"
import { cn } from "@/lib/utils"

/**
 * Reporte de cierre en solo lectura (tarea 4.5 / spec §5 "Cerrado": la liquidación como cara
 * visible del evento). Lee la liquidación congelada (`EventClosingReport`) y la muestra sin
 * ninguna acción de edición. Se reusa tal cual en el workspace del evento cerrado y en la
 * página pública compartible (`ReportPage`), por eso NO depende de auth ni hace fetch.
 */

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

type Props = {
  report: EventClosingReport
  eventName: string
  eventDate?: string | null
  location?: string | null
  /** Nombre de la productora — solo se muestra en la vista pública compartida. */
  productora?: string | null
  /** Slot al margen del header (ej: botón "Compartir" del workspace). */
  headerAction?: React.ReactNode
  /**
   * Cuando el reporte se muestra dentro del workspace del evento, el header permanente de la
   * página ya trae nombre/fecha/estado, así que ocultamos el header interno para no duplicarlo.
   * En la página pública compartida (`showHeader` por defecto) sí se muestra.
   */
  showHeader?: boolean
}

export function EventClosedReport({
  report,
  eventName,
  eventDate,
  location,
  productora,
  headerAction,
  showHeader = true,
}: Props) {
  const netReal = Number.parseFloat(report.netReal)
  const operational = Number.parseFloat(report.expenses.operational)
  const consumed = Number.parseFloat(report.expenses.merchandiseConsumed)
  const leftover = Number.parseFloat(report.leftoverValue)

  const mermaTotal = report.insumos.reduce(
    (acc, i) => acc + (Number.parseFloat(i.mermaValue) || 0),
    0
  )

  const cashDiff =
    report.cash != null
      ? (Number.parseFloat(report.cash.counted) || 0) -
        (Number.parseFloat(report.cash.expected) || 0)
      : null

  const subtitle = [eventDate ? formatDate(eventDate) : null, location]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="space-y-10">
      {showHeader && (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {productora && (
              <p className="text-[12px] uppercase tracking-[0.2em] text-white/30">
                {productora}
              </p>
            )}
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {eventName}
            </h1>
            <p className="mt-2 text-[15px] text-white/45">
              {subtitle ? `${subtitle} · ` : ""}
              Cerrado{" "}
              {report.closedAt && (
                <span className="text-white/30">
                  el {formatDate(report.closedAt)}
                </span>
              )}
            </p>
          </div>
          {headerAction}
        </header>
      )}

      {/* Neto real vs proyectado, lado a lado */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="bg-black/40 px-5 py-7 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
            resultado neto
          </p>
          <p
            className={cn(
              "mt-2 text-4xl font-bold tabular-nums sm:text-5xl",
              netReal >= 0 ? "text-emerald-300" : "text-red-300"
            )}
          >
            {money(report.netReal)}
          </p>
        </div>
        <div className="bg-black/40 px-5 py-7 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
            proyectado
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-white/45 sm:text-5xl">
            {money(report.netProjected)}
          </p>
        </div>
      </div>

      {/* Desglose de la liquidación */}
      <dl className="space-y-2.5 text-[15px]">
        <Row label="Entradas" value={money(report.income.tickets)} muted />
        <Row label="Barra" value={money(report.income.bar)} muted />
        <div className="border-t border-white/[0.06] pt-2.5">
          <Row label="Ingresos totales" value={money(report.income.gross)} strong />
        </div>
        <Row label="Gastos operativos" value={`− ${money(operational)}`} muted />
        <Row label="Mercadería consumida" value={`− ${money(consumed)}`} muted />
        <div className="border-t border-white/[0.08] pt-2.5">
          <Row label="Resultado neto" value={money(report.netReal)} strong />
        </div>
      </dl>

      {/* Sobrante valuado + merma + caja */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="sobrante en stock"
          value={money(leftover)}
          hint="viaja valuado al próximo evento"
        />
        <StatCard
          label="merma"
          value={money(mermaTotal)}
          hint="diferencia estimado − contado"
        />
        {cashDiff != null && (
          <StatCard
            label="caja de puerta"
            value={
              Math.abs(cashDiff) < 0.005
                ? "Cuadra"
                : `${cashDiff > 0 ? "+" : ""}${money(cashDiff)}`
            }
            hint="contado − esperado"
            valueClass={
              Math.abs(cashDiff) < 0.005
                ? "text-emerald-300"
                : cashDiff > 0
                  ? "text-amber-200"
                  : "text-red-300"
            }
          />
        )}
      </div>

      {/* Detalle por insumo: real vs estimado */}
      {report.insumos.length > 0 && (
        <div>
          <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em] text-white/30">
            insumos · contado vs estimado
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-white/[0.07] text-left text-[12px] uppercase tracking-[0.08em] text-white/30">
                  <th className="px-4 py-3 font-medium">insumo</th>
                  <th className="px-4 py-3 text-right font-medium">contado</th>
                  <th className="px-4 py-3 text-right font-medium">estimado</th>
                  <th className="px-4 py-3 text-right font-medium">consumido</th>
                  <th className="px-4 py-3 text-right font-medium">sobrante</th>
                  <th className="px-4 py-3 text-right font-medium">merma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.insumos.map((i) => (
                  <tr key={i.inventoryItemId}>
                    <td className="px-4 py-3 text-white/80">{i.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {numFmt(i.counted)}{" "}
                      <span className="text-white/35">{i.countingUnit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/45">
                      {numFmt(i.estimated)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/60">
                      {money(i.consumedCost)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/60">
                      {money(i.leftoverValue)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        i.mermaUnits > 0 ? "text-amber-200/80" : "text-white/30"
                      )}
                    >
                      {i.mermaUnits > 0 ? money(i.mermaValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function StatCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string
  value: string
  hint: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <p className="text-[12px] uppercase tracking-[0.1em] text-white/30">{label}</p>
      <p
        className={cn(
          "mt-1 text-[18px] font-semibold tabular-nums text-white",
          valueClass
        )}
      >
        {value}
      </p>
      <p className="text-[12px] text-white/35">{hint}</p>
    </div>
  )
}
