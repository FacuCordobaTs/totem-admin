import type { EventClosingReport } from "@/types/events"
import { cn } from "@/lib/utils"
import { PAYMENT_LABELS } from "@/lib/printerUtils"
import { PromoterSalesBlock } from "./event-summary-dashboard"

/**
 * Reporte de cierre en solo lectura (tarea 4.5 / spec §5 "Cerrado": la liquidación como cara
 * visible del evento). Lee la liquidación congelada (`EventClosingReport`) y la muestra sin
 * ninguna acción de edición. Se reusa tal cual en el workspace del evento cerrado y en la
 * página pública compartible (`ReportPage`), por eso NO depende de auth ni hace fetch.
 * La caja se muestra POR PUESTO cuando el evento se cerró con `cashes` (tarea 10.1); los
 * eventos cerrados antes quedan con el `cash` único a nivel evento.
 * Tarea 10.3 — El reporte expandido responde todas las preguntas de la visión §2.8: ingresos
 * por origen (entradas/tragos/saldo) y por método, ventas por hora, top productos, barra que
 * más rindió y ventas por promotor. Todos los bloques nuevos son opcionales: los eventos
 * cerrados antes de 10.3 no los tienen (el reporte viejo sigue igual).
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

  // Tarea 10.1 — Caja por puesto: los cierres nuevos vienen en `cashes[]` (esperado/contado
  // por barra). El `cash` único queda para eventos cerrados antes de 10.1.
  const cashes = report.cashes ?? []
  // Tarea 10.2 — Pendiente de entrega: vendido y no retirado. Ausente en eventos cerrados antes.
  const pending = report.pendingDelivery ?? null
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

      {/* Tarea 10.3 — "Cuánto entró", separado por origen (entradas / tragos / saldo) y por
          método de pago (visión §2.8). Solo en reportes cerrados con 10.3 (opcional). */}
      {(report.incomeBySource != null || report.incomeByMethod != null) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {report.incomeBySource && (
            <IncomeBySourceCard source={report.incomeBySource} />
          )}
          {report.incomeByMethod && (
            <IncomeByMethodCard rows={report.incomeByMethod} />
          )}
        </div>
      )}

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
        {cashes.length === 0 && cashDiff != null && (
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

      {/* Tarea 10.2 — Pendiente de entrega (visión §2.8): "Cuánto vendiste y todavía no
          entregaste" = plata cobrada que todavía se debe. Solo aparece si quedó algo sin
          retirar al cerrar. */}
      {pending != null && pending.quantity > 0 && (
        <div className="rounded-2xl border border-amber-200/25 bg-amber-200/[0.05] px-5 py-4">
          <p className="text-[12px] uppercase tracking-[0.12em] text-amber-200/60">
            pendiente de entrega
          </p>
          <p className="mt-1.5 text-[20px] font-semibold tabular-nums text-amber-200">
            Vendiste {money(pending.amount)} en tragos que nadie retiró ({pending.quantity})
          </p>
          <p className="mt-1 text-[13px] text-white/40">
            Plata cobrada que todavía se debe — queda pendiente hasta su retiro.
          </p>
        </div>
      )}

      {/* Caja POR PUESTO (tarea 10.1): "si falta, se ve dónde" — cada puesto con su esperado
          por método y su contado manual. */}
      {cashes.length > 0 && (
        <div>
          <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em] text-white/30">
            cajas por puesto · contado vs esperado
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-white/[0.07] text-left text-[12px] uppercase tracking-[0.08em] text-white/30">
                  <th className="px-4 py-3 font-medium">puesto</th>
                  <th className="px-4 py-3 text-right font-medium">
                    esperado (efectivo)
                  </th>
                  <th className="px-4 py-3 text-right font-medium">contado</th>
                  <th className="px-4 py-3 text-right font-medium">
                    diferencia
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {cashes.map((c) => {
                  const expected = Number.parseFloat(c.expected) || 0
                  const counted =
                    c.counted != null
                      ? Number.parseFloat(c.counted) || 0
                      : null
                  const diff = counted != null ? counted - expected : null
                  return (
                    <tr key={c.barId ?? "door"}>
                      <td className="px-4 py-3">
                        <p className="text-white/80">{c.barName}</p>
                        {c.byMethod.length > 1 && (
                          <p className="mt-0.5 text-[12px] text-white/30">
                            {c.byMethod
                              .map(
                                (m) =>
                                  `${PAYMENT_LABELS[m.method] ?? m.method} ${money(m.expected)}`
                              )
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/60">
                        {money(expected)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white">
                        {counted != null ? money(counted) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-medium tabular-nums",
                          diff == null
                            ? "text-white/25"
                            : Math.abs(diff) < 0.005
                              ? "text-emerald-300"
                              : diff > 0
                                ? "text-amber-200"
                                : "text-red-300"
                        )}
                      >
                        {diff == null
                          ? "sin contar"
                          : diff === 0
                            ? "Cuadra"
                            : `${diff > 0 ? "+" : ""}${money(diff)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tarea 10.3 — Ventas por hora (visión §2.8: "a qué hora" se vendió más). */}
      {(report.salesByHour ?? []).length > 0 && (
        <HourlySalesChart points={report.salesByHour ?? []} />
      )}

      {/* Tarea 10.3 — Qué se vendió más y qué barra rindió más (visión §2.8). */}
      {(report.topProducts ?? []).length > 0 ||
      (report.barPerformance ?? []).length > 0 ? (
        <div
          className={cn(
            "grid gap-6",
            (report.topProducts ?? []).length > 0 &&
              (report.barPerformance ?? []).length > 0 &&
              "lg:grid-cols-2"
          )}
        >
          {(report.topProducts ?? []).length > 0 && (
            <TopProducts products={report.topProducts ?? []} />
          )}
          {(report.barPerformance ?? []).length > 0 && (
            <BarPerformance bars={report.barPerformance ?? []} />
          )}
        </div>
      ) : null}

      {/* Tarea 10.3 — Ventas por promotor (visión §2.8): mismo bloque que el Resumen (9.2),
          alimentado con el snapshot congelado en `closingReport.byPromoter`. */}
      {(report.byPromoter ?? []).length > 0 && (
        <PromoterSalesBlock rows={report.byPromoter ?? []} />
      )}

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

/* ── Tarea 10.3 — Bloques del reporte expandido (visión §2.8) ─────────────────────────────── */

/** "Cuánto entró, separado por entradas / tragos / saldo." */
function IncomeBySourceCard({
  source,
}: {
  source: NonNullable<EventClosingReport["incomeBySource"]>
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
        ingresos por origen
      </p>
      <div className="mt-3 space-y-2 text-[14px]">
        <div className="flex items-center justify-between">
          <span className="text-white/50">Entradas</span>
          <span className="tabular-nums text-white/80">{money(source.tickets)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/50">Tragos</span>
          <span className="tabular-nums text-white/80">{money(source.tragos)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/50">Saldo cargado</span>
          <span className="tabular-nums text-white/80">{money(source.saldo)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
          <span className="font-semibold text-white/80">Total</span>
          <span className="text-[15px] font-bold tabular-nums text-white">
            {money(source.total)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** "Y por efectivo / tarjeta / MercadoPago." SALDO es informativo: no es plata nueva, son
 * tragos pagados con saldo ya cargado (contado en el origen como "Saldo cargado"). */
function IncomeByMethodCard({
  rows,
}: {
  rows: NonNullable<EventClosingReport["incomeByMethod"]>
}) {
  const real = rows.filter((r) => r.method !== "SALDO")
  const saldoRow = rows.find((r) => r.method === "SALDO")
  const total = real.reduce(
    (acc, r) => acc + (Number.parseFloat(r.amount) || 0),
    0
  )
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <p className="text-[12px] uppercase tracking-[0.12em] text-white/30">
        ingresos por método
      </p>
      <div className="mt-3 space-y-2 text-[14px]">
        {real.map((r) => (
          <div key={r.method} className="flex items-center justify-between">
            <span className="text-white/50">
              {PAYMENT_LABELS[r.method] ?? r.method}
            </span>
            <span className="tabular-nums text-white/80">{money(r.amount)}</span>
          </div>
        ))}
        {saldoRow != null && (
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
            <span className="text-white/35">
              {PAYMENT_LABELS[saldoRow.method]} · consumos con saldo
            </span>
            <span className="tabular-nums text-white/40">{money(saldoRow.amount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
          <span className="font-semibold text-white/80">Total entrado</span>
          <span className="text-[15px] font-bold tabular-nums text-white">
            {money(total)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Ventas por hora: barras CSS (24 buckets locales), el máximo a full altura. */
function HourlySalesChart({
  points,
}: {
  points: NonNullable<EventClosingReport["salesByHour"]>
}) {
  const max = Math.max(...points.map((p) => p.revenue), 1)
  return (
    <div>
      <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em] text-white/30">
        ventas por hora
      </h2>
      <div className="flex h-44 items-end gap-[3px] rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 pt-4">
        {points.map((p) => {
          const height = p.revenue > 0 ? Math.max(3, Math.round((p.revenue / max) * 100)) : 0
          return (
            <div
              key={p.hour}
              className="group relative flex h-full flex-1 items-end"
              title={`${p.label} — ${money(p.revenue)}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  height > 0
                    ? "bg-emerald-300/60 group-hover:bg-emerald-300"
                    : "bg-white/[0.04]"
                )}
                style={{ height: height > 0 ? `${height}%` : "2px" }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/25">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  )
}

/** Qué se vendió más: ranking por unidades, con recaudado. */
function TopProducts({
  products,
}: {
  products: NonNullable<EventClosingReport["topProducts"]>
}) {
  return (
    <div>
      <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em] text-white/30">
        lo que más se vendió
      </h2>
      <ol className="space-y-1.5">
        {products.map((p, i) => (
          <li
            key={`${p.productName}-${i}`}
            className="flex items-center justify-between gap-x-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[14px]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="w-5 shrink-0 text-[12px] tabular-nums text-white/30">
                {i + 1}
              </span>
              <span className="truncate text-white/80">{p.productName}</span>
            </span>
            <span className="shrink-0 tabular-nums text-white/45">
              {numFmt(p.quantitySold)}u
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-white/70">
              {money(p.revenue)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Qué barra rindió más: ranking por recaudado, la primera destacada (visión §2.8). */
function BarPerformance({
  bars,
}: {
  bars: NonNullable<EventClosingReport["barPerformance"]>
}) {
  return (
    <div>
      <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em] text-white/30">
        qué barra rindió más
      </h2>
      <ol className="space-y-1.5">
        {bars.map((b, i) => {
          const revenueNum = Number.parseFloat(b.revenue) || 0
          const isTop = i === 0 && revenueNum > 0
          return (
            <li
              key={b.barId ?? "door"}
              className={cn(
                "flex items-center justify-between gap-x-3 rounded-xl border px-4 py-2.5 text-[14px]",
                isTop
                  ? "border-emerald-200/30 bg-emerald-200/[0.06]"
                  : "border-white/[0.06] bg-white/[0.02]"
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-[12px] tabular-nums text-white/30">
                  {i + 1}
                </span>
                <span className="truncate text-white/80">{b.barName}</span>
                {isTop && (
                  <span className="shrink-0 rounded-full bg-emerald-200/15 px-2 py-0.5 text-[11px] text-emerald-200/90">
                    la que más rindió
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-white/40">
                {b.salesCount} ventas
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums text-white/70">
                {money(b.revenue)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
