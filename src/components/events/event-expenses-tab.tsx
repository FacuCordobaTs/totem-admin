import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Receipt, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type {
  EventExpenseCategory,
  EventExpenseRow,
  EventExpensesResponse,
} from "@/types/event-dashboard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const CATEGORY_OPTIONS: { value: EventExpenseCategory; label: string }[] = [
  { value: "MUSIC", label: "Música" },
  { value: "LIGHTS", label: "Luces" },
  { value: "FOOD", label: "Comida / bebida" },
  { value: "STAFF", label: "Personal / pagos" },
  { value: "MARKETING", label: "Marketing" },
  { value: "INFRASTRUCTURE", label: "Infraestructura" },
  { value: "OTHER", label: "Otro" },
]

/** Música con tinte de acento app */
function categoryBadgeClass(category: EventExpenseCategory): string {
  if (category === "MUSIC") {
    return "bg-[#FF9500]/15 text-[#FF9500]"
  }
  return "bg-zinc-500/10 text-[#8E8E93] dark:text-[#98989D]"
}

function formatMoneyArs(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatExpenseDate(value: Date | string | null): string {
  if (value == null) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function sumAmounts(rows: EventExpenseRow[]): string {
  let t = 0
  for (const r of rows) {
    const n = Number.parseFloat(r.amount)
    if (!Number.isNaN(n)) t += n
  }
  return t.toFixed(2)
}

const inputClass =
  "h-11 rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

const selectClass =
  "h-11 w-full rounded-xl border-zinc-200/50 bg-white px-4 text-[15px] transition-all duration-200 dark:border-zinc-800/50 dark:bg-[#1C1C1E]"

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-28 animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-700/50" />
      <div className="h-52 animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-700/50" />
    </div>
  )
}

type Props = {
  eventId: string
  embedded?: boolean
  onExpensesChanged?: () => void
}

export function EventExpensesTab({ eventId, embedded = false, onExpensesChanged }: Props) {
  const token = useAuthStore((s) => s.token)
  const [expenses, setExpenses] = useState<EventExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formDescription, setFormDescription] = useState("")
  const [formCategory, setFormCategory] = useState<EventExpenseCategory>("OTHER")
  const [formAmount, setFormAmount] = useState("")

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<EventExpensesResponse>(
        `/events/${eventId}/expenses`,
        { method: "GET", token }
      )
      setExpenses(res.expenses)
    } catch (e) {
      setExpenses([])
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los gastos")
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load])

  const totalLabel = useMemo(() => formatMoneyArs(sumAmounts(expenses)), [expenses])

  async function submitExpense() {
    const desc = formDescription.trim()
    const amtRaw = formAmount.trim().replace(",", ".")
    if (!token || !desc || submitBusy) return
    if (!/^\d+(\.\d{1,2})?$/.test(amtRaw)) {
      toast.error("Ingresá un monto válido (ej. 1500 o 1500.50)")
      return
    }
    setSubmitBusy(true)
    try {
      await apiFetch(`/events/${eventId}/expenses`, {
        method: "POST",
        token,
        body: JSON.stringify({
          description: desc,
          category: formCategory,
          amount: amtRaw,
        }),
      })
      toast.success("Gasto registrado")
      setDialogOpen(false)
      setFormDescription("")
      setFormCategory("OTHER")
      setFormAmount("")
      await load()
      onExpensesChanged?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el gasto")
    } finally {
      setSubmitBusy(false)
    }
  }

  async function deleteExpense(row: EventExpenseRow) {
    if (!token || deletingId) return
    const prev = expenses
    setDeletingId(row.id)
    setExpenses((xs) => xs.filter((x) => x.id !== row.id))
    try {
      await apiFetch(`/events/${eventId}/expenses/${row.id}`, {
        method: "DELETE",
        token,
      })
      toast.success("Gasto eliminado")
      onExpensesChanged?.()
    } catch (e) {
      setExpenses(prev)
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar el gasto")
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <TableSkeleton />
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200/60 bg-red-50 px-5 py-4 text-[15px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {embedded ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
            Registro operativo del evento
          </p>
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="h-10 shrink-0 gap-1.5 rounded-xl bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-all duration-200 active:opacity-70"
          >
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Finanzas
            </p>
            <h2 className="mt-1 text-[28px] font-bold tracking-tight text-black dark:text-white md:text-[34px]">
              Gastos del evento
            </h2>
          </div>
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="h-11 shrink-0 gap-2 self-start rounded-xl bg-[#FF9500] px-5 text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Plus className="h-4 w-4 text-white" />
            </span>
            Registrar gasto
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50 lg:max-w-md">
        <CardHeader className="pb-2 md:p-6 md:pb-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF9500]/15">
              <Receipt className="h-5 w-5 text-[#FF9500]" />
            </span>
            <CardTitle className="text-[13px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Total de gastos
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="md:px-6 md:pb-6">
          <p className="text-[34px] font-bold tabular-nums tracking-tight text-black dark:text-white">
            {totalLabel}
          </p>
          <p className="mt-1 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
            Suma de ítems cargados en este evento
          </p>
        </CardContent>
      </Card>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200/50 px-5 py-12 text-center text-[15px] text-[#8E8E93] dark:border-zinc-800/50 dark:text-[#98989D]">
          No hay gastos registrados. Cargá costos operativos para ver el resultado neto del
          evento.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Descripción
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Categoría
                </TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                  Monto
                </TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((row) => {
                const catLabel =
                  CATEGORY_OPTIONS.find((c) => c.value === row.category)?.label ??
                  row.category
                const busy = deletingId === row.id
                return (
                  <TableRow
                    key={row.id}
                    className="border-zinc-200/50 transition-colors duration-200 hover:bg-[#F2F2F7]/80 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
                  >
                    <TableCell className="whitespace-nowrap py-3 text-[#8E8E93] dark:text-[#98989D]">
                      {formatExpenseDate(row.date)}
                    </TableCell>
                    <TableCell className="py-3 font-semibold text-black dark:text-white">
                      {row.description}
                    </TableCell>
                    <TableCell className="py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${categoryBadgeClass(row.category)}`}
                      >
                        {catLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-[15px] font-semibold tabular-nums text-black dark:text-white">
                      {formatMoneyArs(row.amount)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`Eliminar gasto ${row.description}`}
                        onClick={() => void deleteExpense(row)}
                        className="h-9 w-9 rounded-xl text-[#8E8E93] hover:bg-red-500/10 hover:text-red-600 dark:text-[#98989D]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border border-zinc-200/50 bg-white p-0 sm:max-w-md dark:border-zinc-800/50 dark:bg-[#1C1C1E]">
          <div className="border-b border-zinc-200/50 p-6 dark:border-zinc-800/50">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15">
                <Receipt className="h-6 w-6 text-[#FF9500]" />
              </span>
              <DialogHeader className="flex-1 text-left">
                <DialogTitle className="text-[22px] font-bold tracking-tight text-black dark:text-white">
                  Registrar gasto
                </DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-5 p-6">
            <div className="space-y-2">
              <label
                className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
                htmlFor="expense-desc"
              >
                Descripción
              </label>
              <Input
                id="expense-desc"
                placeholder="Ej. Cachet DJ, alquiler sonido"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <span className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                Categoría
              </span>
              <Select
                value={formCategory}
                onValueChange={(v) => setFormCategory(v as EventExpenseCategory)}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="rounded-lg py-2">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label
                className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]"
                htmlFor="expense-amount"
              >
                Monto (ARS)
              </label>
              <Input
                id="expense-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className={cn(inputClass, "font-mono tabular-nums")}
              />
            </div>
          </div>
          <div className="border-t border-zinc-200/50 bg-white/70 p-5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
            <DialogFooter className="flex-col gap-3 sm:flex-col">
              <Button
                type="button"
                disabled={!formDescription.trim() || !formAmount.trim() || submitBusy}
                onClick={() => void submitExpense()}
                className="h-11 w-full rounded-xl bg-[#FF9500] text-[15px] font-semibold text-white transition-all duration-200 hover:opacity-95 active:opacity-50"
              >
                {submitBusy ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="h-11 w-full rounded-xl border-zinc-200/50 text-[15px] font-semibold transition-all duration-200 active:opacity-50 dark:border-zinc-800/50"
              >
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
