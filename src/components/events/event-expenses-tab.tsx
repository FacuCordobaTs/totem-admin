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
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

const CATEGORY_OPTIONS: { value: EventExpenseCategory; label: string }[] = [
  { value: "MUSIC", label: "Música" },
  { value: "LIGHTS", label: "Luces" },
  { value: "FOOD", label: "Comida / bebida" },
  { value: "STAFF", label: "Personal / pagos" },
  { value: "MARKETING", label: "Marketing" },
  { value: "INFRASTRUCTURE", label: "Infraestructura" },
  { value: "OTHER", label: "Otro" },
]

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
  "h-11 rounded-xl border-0 bg-white/[0.06] px-3 text-[15px] text-white placeholder:text-white/25 shadow-none focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"

const selectClass =
  "h-11 w-full rounded-xl border-0 bg-white/[0.06] px-3 text-[15px] text-white shadow-none"

const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"

const tableHeadClass = "text-[11px] font-normal lowercase text-white/45"

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-32 animate-pulse rounded-2xl bg-white/[0.05] motion-reduce:animate-none" />
      <div className="h-44 animate-pulse rounded-2xl bg-white/[0.05] motion-reduce:animate-none" />
    </div>
  )
}

type Props = {
  eventId: string
  onExpensesChanged?: () => void
}

export function EventExpensesTab({ eventId, onExpensesChanged }: Props) {
  const token = useAuthStore((s) => s.token)
  const [expenses, setExpenses] = useState<EventExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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

  // Spec §4.6: la mercadería NO se carga a mano acá — entra sola por las compras de la Barra
  // (gastos con `purchaseId`). Los separamos: el operativo es editable, la mercadería es lectura.
  const operativos = useMemo(
    () => expenses.filter((e) => e.purchaseId == null),
    [expenses]
  )
  const mercaderia = useMemo(
    () => expenses.filter((e) => e.purchaseId != null),
    [expenses]
  )
  const totalLabel = useMemo(() => formatMoneyArs(sumAmounts(expenses)), [expenses])
  const operativosLabel = useMemo(
    () => formatMoneyArs(sumAmounts(operativos)),
    [operativos]
  )
  const mercaderiaLabel = useMemo(
    () => formatMoneyArs(sumAmounts(mercaderia)),
    [mercaderia]
  )

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
      setFormDescription("")
      setFormCategory("OTHER")
      setFormAmount("")
      setDialogOpen(false)
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
      <div role="alert" className="space-y-3">
        <p className="text-[14px] text-rose-300">{error}</p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void load()}
          className="h-10 rounded-xl bg-white/[0.06] px-4 text-white/80 hover:bg-white/[0.1] hover:text-white"
        >
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Gastos</h2>
          <p className="mt-1 text-[13px] text-white/45">
            Operativos y mercadería del evento.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={primaryButtonClass}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo gasto
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/[0.02] lg:max-w-md">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
              <Receipt className="h-4 w-4 text-white/35" />
            </span>
            <p className="text-[13px] font-normal lowercase text-white/45">
              Total de gastos
            </p>
          </div>
          <p className="mt-3 text-[34px] font-bold tabular-nums tracking-tight text-white">
            {totalLabel}
          </p>
        </div>
        {mercaderia.length > 0 ? (
          <div className="mt-4 space-y-1 border-t border-white/[0.06] px-5 py-4 text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/45">Operativos</span>
              <span className="tabular-nums text-white/70">{operativosLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/45">Mercadería (compras de Barra)</span>
              <span className="tabular-nums text-white/70">{mercaderiaLabel}</span>
            </div>
          </div>
        ) : null}
      </div>

      {operativos.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
          <Table className="table-fixed md:table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className={`w-[54%] pl-4 md:w-auto ${tableHeadClass}`}>
                  Descripción
                </TableHead>
                <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                  Fecha
                </TableHead>
                <TableHead className={`hidden text-[11px] font-normal lowercase text-white/45 sm:table-cell`}>
                  Categoría
                </TableHead>                <TableHead className={`text-right ${tableHeadClass}`}>
                  Monto
                </TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Eliminar gasto</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
              {operativos.map((row) => {
                const catLabel =
                  CATEGORY_OPTIONS.find((c) => c.value === row.category)?.label ??
                  row.category
                const busy = deletingId === row.id
                return (
                  <TableRow
                    key={row.id}
                    className="border-0 transition-colors hover:bg-white/[0.03]"
                  >
                    <TableCell className="py-3.5 pl-4">
                      <p
                        className="truncate text-[15px] font-medium text-white"
                        title={row.description}
                      >
                        {row.description}
                      </p>
                    </TableCell>
                    <TableCell className={`hidden py-3.5 text-[13px] text-white/45 md:table-cell`}>
                      {formatExpenseDate(row.date)}
                    </TableCell>
                    <TableCell className="hidden py-3.5 text-[12px] text-white/45 sm:table-cell">
                      <span className="truncate">{catLabel}</span>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-[14px] font-medium tabular-nums text-white">
                      {formatMoneyArs(row.amount)}
                    </TableCell>
                    <TableCell className="py-3.5 pr-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`Eliminar gasto ${row.description}`}
                        onClick={() => void deleteExpense(row)}
                        className="h-8 w-8 rounded-lg text-white/30 hover:bg-rose-500/10 hover:text-rose-400"
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
      ) : (
        <p className="text-[13px] text-white/40">
          Todavía no hay gastos operativos registrados.
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
            <DialogDescription>
              Los gastos de mercadería se registran automáticamente desde las compras de Barra.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Descripción (ej. Cachet DJ)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className={inputClass}
            />
            <Select
              value={formCategory}
              onValueChange={(v) => setFormCategory(v as EventExpenseCategory)}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="rounded-lg py-2">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="$ Monto"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitExpense()
              }}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-white/60 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!formDescription.trim() || !formAmount.trim() || submitBusy}
              onClick={() => void submitExpense()}
              className={primaryButtonClass}
            >
              {submitBusy ? "Agregando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
