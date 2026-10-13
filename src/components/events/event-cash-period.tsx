import { useEffect, useRef, useState } from "react"
import Decimal from "decimal.js"
import { ArrowLeft, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import { PAYMENT_LABELS } from "@/lib/printerUtils"
import { useAuthStore } from "@/stores/auth-store"

type Method = { method: string; amount: string }
type CashPeriodReport = {
  period: { from: string; to: string; timezone: string }
  generatedAt: string
  collected: string
  cashExpected: string
  balanceSpent: string
  expenses: string
  afterExpenses: string
  salesCount: number
  byMethod: Method[]
  byBar: { barId: string | null; barName: string; collected: string; cashExpected: string; salesCount: number; byMethod: Method[] }[]
}

const money = (value: string) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 2,
}).format(Number(value))
const label = (method: string) => PAYMENT_LABELS[method] ?? method
const dateLabel = (value: string) => value.split("-").reverse().join("/")

/** Most recent complete Friday + Saturday, independent of the device's timezone. */
function lastWeekend() {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
  const day = new Date(`${today}T12:00:00Z`)
  const daysSinceSaturday = (day.getUTCDay() - 6 + 7) % 7 || 7
  day.setUTCDate(day.getUTCDate() - daysSinceSaturday)
  const to = day.toISOString().slice(0, 10)
  day.setUTCDate(day.getUTCDate() - 1)
  return { from: day.toISOString().slice(0, 10), to }
}

function countedValue(raw: string | undefined) {
  const value = raw?.trim().replace(",", ".") ?? ""
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  return new Decimal(value).toFixed(2)
}

export function EventCashPeriod({ eventId, eventName, onBack }: {
  eventId: string; eventName: string; onBack: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [dates, setDates] = useState(lastWeekend)
  const [report, setReport] = useState<CashPeriodReport | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])
  const changeDates = (next: typeof dates) => {
    request.current += 1
    setDates(next)
    setReport(null)
    setCounts({})
    setError(null)
    setLoading(false)
  }
  const load = async () => {
    const current = ++request.current
    setLoading(true)
    setError(null)
    setReport(null)
    setCounts({})
    try {
      const query = new URLSearchParams(dates)
      const data = await apiFetch<CashPeriodReport>(`/events/${eventId}/cash-period?${query}`, { token })
      if (current === request.current) setReport(data)
    } catch (err) {
      if (current === request.current) setError(err instanceof Error ? err.message : "No se pudo consultar la caja.")
    } finally {
      if (current === request.current) setLoading(false)
    }
  }
  const download = () => {
    if (!report) return
    const rows = [
      ["Caja por fechas", eventName],
      ["Desde", report.period.from, "Hasta", report.period.to, "Horario argentino"],
      ["Consultado", report.generatedAt],
      ["Ingresos cobrados", report.collected], ["Gastos registrados", report.expenses],
      ["Cobrado menos gastos", report.afterExpenses], ["Pagado con saldo (sin nuevo ingreso)", report.balanceSpent],
      [], ["Puesto", "Operaciones", "Cobrado", "Efectivo esperado", "Efectivo contado", "Diferencia", ...report.byMethod.map((m) => label(m.method))],
      ...report.byBar.map((bar) => {
        const counted = countedValue(counts[bar.barId ?? ""])
        return [bar.barName, String(bar.salesCount), bar.collected, bar.cashExpected, counted ?? "",
          counted == null ? "" : new Decimal(counted).minus(bar.cashExpected).toFixed(2),
          ...bar.byMethod.map((m) => m.amount)]
      }),
    ]
    const csv = rows.map((row) => row.map((cell) => {
      // Prevent spreadsheet formulas from event/bar names supplied by users.
      const safe = /^[=+@\-\t\r]/.test(cell) ? `'${cell}` : cell
      return `"${safe.replaceAll('"', '""')}"`
    }).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `caja-${report.period.from}-${report.period.to}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const invalidCounts = Object.values(counts).some((raw) => raw.trim() !== "" && countedValue(raw) == null)
  const inputClass = "w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white [color-scheme:dark]"

  return <section className="mx-auto max-w-4xl space-y-6 py-6">
    <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Volver al evento</Button>
    <div>
      <h2 className="text-2xl font-bold">Caja por fechas</h2>
      <p className="mt-2 text-sm text-white/60">Elegí los días que querés revisar. El evento sigue abierto y podés repetir el corte cada semana.</p>
    </div>
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void load() }}>
      <label className="flex-1 space-y-1 text-sm">Desde
        <input aria-label="Desde" type="date" required value={dates.from} max={dates.to || undefined} onChange={(e) => changeDates({ ...dates, from: e.target.value })} className={inputClass} />
      </label>
      <label className="flex-1 space-y-1 text-sm">Hasta
        <input aria-label="Hasta" type="date" required min={dates.from || undefined} value={dates.to} onChange={(e) => changeDates({ ...dates, to: e.target.value })} className={inputClass} />
      </label>
      <Button type="submit" disabled={loading || !dates.from || !dates.to || dates.from > dates.to}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Consultar caja
      </Button>
    </form>
    <p className="text-xs text-white/50">Días completos, de 00:00 a 23:59 en horario argentino. Incluí el domingo si la noche del sábado termina después de medianoche.</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {report && <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">{dateLabel(report.period.from)} al {dateLabel(report.period.to)}</h3>
          <p className="text-xs text-white/50">{report.salesCount} operaciones completadas · Consultado {new Date(report.generatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p></div>
        <Button variant="outline" onClick={download} disabled={invalidCounts}><Download className="mr-2 h-4 w-4" />Descargar corte</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[["Ingresos cobrados", report.collected], ["Gastos registrados", report.expenses], ["Cobrado menos gastos", report.afterExpenses]].map(([title, value]) =>
          <div key={title} className="rounded-xl border border-white/10 p-4"><p className="text-sm text-white/60">{title}</p><p className="mt-2 text-2xl font-semibold">{money(value)}</p></div>)}
      </div>
      <p className="text-xs text-white/50">Incluye cargas de saldo cobradas. Los consumos pagados con saldo no suman dinero nuevo. Los gastos incluyen compras una sola vez y se toman por su fecha registrada; no se descuentan del efectivo esperado porque no tienen medio de pago ni puesto asignado.</p>
      <div className="flex flex-wrap gap-x-8 gap-y-3">{report.byMethod.map((method) => <div key={method.method}>
        <p className="text-xs text-white/50">{label(method.method)}{method.method === "SALDO" ? " (sin nuevo ingreso)" : ""}</p><p className="font-semibold">{money(method.amount)}</p>
      </div>)}</div>
      {report.byBar.length === 0 && <p className="rounded-xl border border-white/10 p-6 text-white/60">No hubo operaciones completadas en esos días.</p>}
      <div className="space-y-4">{report.byBar.map((bar) => {
        const key = bar.barId ?? ""
        const raw = counts[key] ?? ""
        const counted = countedValue(raw)
        const difference = counted == null ? null : new Decimal(counted).minus(bar.cashExpected).toFixed(2)
        return <article key={key} className="space-y-4 rounded-xl border border-white/10 p-4 sm:p-5">
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{bar.barName}</h4><span className="text-sm text-white/60">{bar.salesCount} operaciones · Cobrado {money(bar.collected)}</span></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">{bar.byMethod.filter((m) => new Decimal(m.amount).gt(0)).map((m) => <span key={m.method}>{label(m.method)}: {money(m.amount)}</span>)}</div>
          {new Decimal(bar.cashExpected).gt(0) && <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
            <div><p className="text-xs text-white/50">Efectivo esperado por cobros</p><p className="font-semibold">{money(bar.cashExpected)}</p></div>
            <label className="space-y-1 text-sm">Efectivo contado
              <input aria-label={`Efectivo contado en ${bar.barName}`} inputMode="decimal" placeholder="Sin contar" value={raw} onChange={(e) => setCounts({ ...counts, [key]: e.target.value })} className={inputClass} aria-invalid={raw.trim() !== "" && counted == null} />
              {raw.trim() !== "" && counted == null && <span className="text-xs text-red-400">Ingresá un importe positivo o cero, con hasta 2 decimales.</span>}
            </label>
            <div><p className="text-xs text-white/50">Diferencia (contado − esperado)</p><p className="font-semibold">{difference == null ? "Sin contar" : money(difference)}</p></div>
          </div>}
        </article>
      })}</div>
      <p className="text-xs text-white/50">El conteo es para esta consulta y se incluye en la descarga. No se guarda en el evento. El corte no calcula consumo de inventario ni ganancia final.</p>
    </div>}
  </section>
}
