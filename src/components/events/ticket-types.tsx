import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import Decimal from "decimal.js"
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Ticket,
  Trash2,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { admissionInputToIso, toAdmissionInput } from "@/lib/ticket-admission"
import { TicketAdmissionFields } from "./ticket-admission-fields"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useEventNestedView } from "./event-mobile-nav"
import "./tickets-workspace.css"

export type ApiTicketType = {
  validFrom: string | null
  validUntil: string | null
  id: string
  eventId: string
  tenantId: string
  name: string
  price: string
  stockLimit: number | null
  isActive?: boolean
  promoBuy?: number | null
  promoPay?: number | null
  sold: number
  remaining: number | null
  courtesies?: number
}

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }
type TicketTypesProps = {
  eventId: string
  refreshTrigger: number
  onChanged?: () => void
  onCountChange?: (count: number) => void
  /** Permite a la página ocultar el resto de Entradas mientras se edita. */
  onEditingChange?: (editing: boolean) => void
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; type: ApiTicketType }

const fieldInputClass =
  "h-11 rounded-xl border-white/[0.12] bg-white/[0.04] px-3 text-[15px] text-white placeholder:text-white/25 shadow-none focus-visible:border-[#FF9500] focus-visible:ring-0"
const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const switchClass =
  "h-6 w-11 data-[state=checked]:bg-[#FF9500] data-[state=unchecked]:bg-white/[0.16]"
const headClass = "text-[11px] font-normal lowercase text-white/45"

function formatPrice(price: string): string {
  try {
    return (
      "$ " +
      new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
        new Decimal(price).toNumber()
      )
    )
  } catch {
    return "—"
  }
}

function admissionSummary(type: ApiTicketType): string | null {
  const format = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hourCycle: "h23",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value))
  if (type.validFrom && type.validUntil)
    return `${format(type.validFrom)} — ${format(type.validUntil)}`
  if (type.validFrom) return `Desde ${format(type.validFrom)}`
  if (type.validUntil) return `Hasta ${format(type.validUntil)}`
  return null
}

function formatPriceInput(price: string): string {
  try {
    const value = new Decimal(price)
    return value.isInteger() ? value.toFixed(0) : value.toFixed(2)
  } catch {
    return price
  }
}

function availabilityCaption(type: ApiTicketType): string {
  if (type.remaining === 0) return "Agotada"
  if (type.remaining == null) return "Sin límite"
  return `${type.remaining.toLocaleString("es-AR")} disponibles`
}

function FormField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-white/70">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-white/45">{hint}</p> : null}
    </div>
  )
}

function FormBlock({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t border-white/[0.07] pt-7 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-8">
      <div>
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-white">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={title}
        className={cn(switchClass, "mt-0.5 shrink-0")}
      />
    </div>
  )
}

function TicketTypeEditor({
  eventId,
  type,
  onSaved,
  onCancel,
}: {
  eventId: string
  type?: ApiTicketType
  onSaved: () => void
  onCancel: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const id = type?.id ?? "new"
  const [name, setName] = useState(type?.name ?? "")
  const [price, setPrice] = useState(type ? formatPriceInput(type.price) : "")
  const [stock, setStock] = useState(type?.stockLimit?.toString() ?? "")
  const [active, setActive] = useState(type?.isActive !== false)
  const [promoEnabled, setPromoEnabled] = useState(type?.promoBuy != null)
  const [promoBuy, setPromoBuy] = useState(type?.promoBuy?.toString() ?? "2")
  const [promoPay, setPromoPay] = useState(type?.promoPay?.toString() ?? "1")
  const [admissionEnabled, setAdmissionEnabled] = useState(
    Boolean(type?.validFrom || type?.validUntil)
  )
  const [from, setFrom] = useState(toAdmissionInput(type?.validFrom ?? null))
  const [until, setUntil] = useState(toAdmissionInput(type?.validUntil ?? null))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || saving || deleting) return
    setError(null)
    const normalizedPrice = price.trim().replace(",", ".")
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalizedPrice)) {
      setError("Ingresá un precio válido, con hasta dos decimales.")
      return
    }
    if (
      stock.trim() !== "" &&
      (!/^\d+$/.test(stock.trim()) ||
        !Number.isSafeInteger(Number(stock)) ||
        Number(stock) < 1 ||
        Number(stock) > 2147483647)
    ) {
      setError("El cupo debe ser un número entero mayor a cero.")
      return
    }
    if (admissionEnabled && from && until && from >= until) {
      setError("El horario hasta debe ser posterior al horario desde.")
      return
    }
    const buy = promoEnabled ? Number(promoBuy) : null
    const pay = promoEnabled ? Number(promoPay) : null
    if (
      promoEnabled &&
      (buy == null ||
        pay == null ||
        !Number.isInteger(buy) ||
        !Number.isInteger(pay) ||
        buy < 2 ||
        buy > 20 ||
        pay < 1 ||
        pay >= buy)
    ) {
      setError("Revisá la promoción: llevás entre 2 y 20, y pagás una cantidad menor.")
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types${type ? `/${type.id}` : ""}`, {
        method: type ? "PATCH" : "POST",
        token,
        body: JSON.stringify({
          name: name.trim(),
          price: new Decimal(normalizedPrice).toFixed(2),
          stockLimit: stock.trim() === "" ? null : Number(stock),
          promoBuy: buy,
          promoPay: pay,
          validFrom: admissionEnabled ? admissionInputToIso(from) : null,
          validUntil: admissionEnabled ? admissionInputToIso(until) : null,
          ...(type ? { isActive: active } : {}),
        }),
      })
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar el tipo de entrada. Volvé a intentar."
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!token || !type || deleting || saving) return
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${type.id}`, { method: "DELETE", token })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el tipo de entrada.")
    } finally {
      setDeleting(false)
    }
  }

  const promoPercent =
    promoEnabled && Number(promoBuy) > Number(promoPay) && Number(promoBuy) > 0
      ? Math.round((1 - Number(promoPay) / Number(promoBuy)) * 100)
      : null

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tipos de entrada
        </button>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          {type ? type.name : "Nuevo tipo de entrada"}
        </h2>
      </header>

      <form onSubmit={save} className="max-w-3xl space-y-7 pb-2" aria-label={type ? `Editar ${type.name}` : "Nuevo tipo de entrada"}>
        <fieldset disabled={saving || deleting} className="space-y-7">
          <FormBlock title="Datos de la entrada">
            <div className="grid gap-5">
              <FormField label="Nombre" htmlFor={`type-name-${id}`}>
                <Input
                  autoFocus
                  id={`type-name-${id}`}
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="General, VIP, Campo…"
                  className={fieldInputClass}
                />
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Precio" htmlFor={`type-price-${id}`}>
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-white/35"
                    >
                      $
                    </span>
                    <Input
                      id={`type-price-${id}`}
                      required
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0"
                      className={cn(fieldInputClass, "pl-7 tabular-nums")}
                    />
                  </div>
                </FormField>
                <FormField
                  label="Cupo"
                  htmlFor={`type-stock-${id}`}
                  hint="Dejalo vacío para no limitar la cantidad."
                >
                  <Input
                    id={`type-stock-${id}`}
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="Sin límite"
                    className={cn(fieldInputClass, "tabular-nums")}
                  />
                </FormField>
              </div>
            </div>
          </FormBlock>

          <FormBlock title="Promoción">
            <ToggleRow
              title="Llevá varias y pagá menos"
              description="Se aplica sola al comprar la cantidad de entradas indicada."
              checked={promoEnabled}
              onCheckedChange={setPromoEnabled}
              disabled={saving || deleting}
            />
            {promoEnabled ? (
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:max-w-[280px]">
                  <FormField label="Llevás" htmlFor={`type-buy-${id}`}>
                    <Input
                      id={`type-buy-${id}`}
                      inputMode="numeric"
                      value={promoBuy}
                      onChange={(e) => setPromoBuy(e.target.value)}
                      className={cn(fieldInputClass, "tabular-nums")}
                    />
                  </FormField>
                  <FormField label="Pagás" htmlFor={`type-pay-${id}`}>
                    <Input
                      id={`type-pay-${id}`}
                      inputMode="numeric"
                      value={promoPay}
                      onChange={(e) => setPromoPay(e.target.value)}
                      className={cn(fieldInputClass, "tabular-nums")}
                    />
                  </FormField>
                </div>
                <p className="text-[12px] text-white/50" aria-live="polite">
                  {promoPercent != null
                    ? `Llevando ${promoBuy} pagás ${promoPay}: ${promoPercent}% menos.`
                    : "Llevás entre 2 y 20 entradas y pagás una cantidad menor."}
                </p>
              </div>
            ) : null}
          </FormBlock>

          <FormBlock title="Horario de ingreso">
            <ToggleRow
              title="Restringir horario"
              description="Limita desde y hasta cuándo se puede usar esta entrada."
              checked={admissionEnabled}
              onCheckedChange={setAdmissionEnabled}
              disabled={saving || deleting}
            />
            {admissionEnabled ? (
              <div className="mt-5">
                <TicketAdmissionFields
                  from={from}
                  until={until}
                  onFromChange={setFrom}
                  onUntilChange={setUntil}
                  disabled={saving || deleting}
                />
              </div>
            ) : null}
          </FormBlock>

          {type ? (
            <FormBlock title="Disponibilidad">
              <ToggleRow
                title="Activa en la tienda"
                description="Si la desactivás, no se puede comprar. Las entradas ya emitidas siguen valiendo."
                checked={active}
                onCheckedChange={setActive}
                disabled={saving || deleting}
              />
            </FormBlock>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-[13px] leading-relaxed text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6">
          <div>
            {type ? (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-rose-200/90">
                  <span>¿Eliminar esta entrada?</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving || deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="h-9 rounded-lg px-2.5 text-white/60 hover:text-white"
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || deleting}
                    onClick={() => void remove()}
                    className="h-9 rounded-lg bg-rose-500/15 px-3 text-rose-200 hover:bg-rose-500/25"
                  >
                    {deleting ? "Eliminando…" : "Eliminar"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving || deleting}
                  onClick={() => setConfirmDelete(true)}
                  className="h-9 rounded-lg px-2.5 text-white/40 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving || deleting}
              onClick={onCancel}
              className="h-10 rounded-xl px-4 text-white/60 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || deleting || !name.trim()}
              className={primaryButtonClass}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : type ? null : (
                <Plus className="h-4 w-4" />
              )}
              {saving ? "Guardando…" : type ? "Guardar cambios" : "Crear tipo"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function TicketTypes({
  eventId,
  refreshTrigger,
  onChanged,
  onCountChange,
  onEditingChange
}: TicketTypesProps) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const loaded = useRef(false)
  useEventNestedView(editor !== null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    if (!loaded.current) setLoading(true)
    try {
      const data = await apiFetch<TicketTypesResponse>(`/events/${eventId}/ticket-types`, {
        method: "GET",
        token
      })
      setTypes(data.ticketTypes)
      onCountChange?.(data.ticketTypes.length)
      loaded.current = true
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudieron cargar los tipos de entrada."
      )
    } finally {
      setLoading(false)
    }
  }, [token, eventId, onCountChange])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  useEffect(() => {
    onEditingChange?.(editor !== null)
  }, [editor, onEditingChange])

  const handleChanged = useCallback(() => {
    if (onChanged) onChanged()
    else void load()
  }, [load, onChanged])

  const closeEditor = useCallback(() => setEditor(null), [])

  const handleSaved = useCallback(() => {
    setEditor(null)
    handleChanged()
  }, [handleChanged])

  if (editor) {
    return (
      <TicketTypeEditor
        key={editor.mode === "edit" ? editor.type.id : "new"}
        eventId={eventId}
        type={editor.mode === "edit" ? editor.type : undefined}
        onSaved={handleSaved}
        onCancel={closeEditor}
      />
    )
  }

  return (
    <section className="w-full space-y-5" aria-labelledby="ticket-types-title">
      <header className="flex flex-wrap items-center gap-3">
        <h2
          id="ticket-types-title"
          className="mr-auto flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground"
        >
          Tipos de entrada
          {!loading ? (
            <span className="text-[13px] font-medium text-white/45 tabular-nums">
              {types.length}
            </span>
          ) : null}
        </h2>
        {canManage && (loading || types.length > 0) ? (
          <Button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Nuevo tipo
          </Button>
        ) : null}
      </header>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-4 py-3">
          <p role="alert" className="text-[13px] text-rose-300">
            {error}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            className="ml-auto h-8 rounded-lg px-2.5 text-white/60 hover:text-white"
          >
            Reintentar
          </Button>
        </div>
      ) : null}

      {error && types.length === 0 ? null : loading ? (
        <div className="overflow-hidden rounded-2xl" aria-busy="true" aria-label="Cargando tipos de entrada">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className={cn(headClass, "pl-4")}>Entrada</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Precio</TableHead>
                <TableHead className={headClass}>Vendidas / cupo</TableHead>
                <TableHead className={cn(headClass, "hidden sm:table-cell")}>Estado</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-0 hover:bg-transparent">
                  <TableCell className="py-5 pl-4" colSpan={5}>
                    <div className="h-5 animate-pulse rounded-lg bg-white/[0.06]" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : types.length === 0 ? (
        <div className="border-y border-white/[0.06] py-16 text-center">
          <Ticket className="mx-auto h-6 w-6 text-white/25" strokeWidth={1.5} />
          <h3 className="mt-4 text-[16px] font-semibold text-white">Todavía no hay tipos de entrada</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/50">
            Creá el primero para abrir la venta en la tienda y habilitar la emisión desde Asistentes.
          </p>
          {canManage ? (
            <Button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className={cn(primaryButtonClass, "mt-5")}
            >
              <Plus className="h-4 w-4" />
              Crear primera entrada
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl sm:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                  <TableHead className={cn(headClass, "pl-4")}>Entrada</TableHead>
                  <TableHead className={cn(headClass, "w-[18%]")}>Precio</TableHead>
                  <TableHead className={cn(headClass, "w-[22%]")}>Vendidas / cupo</TableHead>
                  <TableHead className={cn(headClass, "w-[15%]")}>Estado</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                {types.map((type) => {
                  const admission = admissionSummary(type)
                  const inactive = type.isActive === false
                  return (
                    <TableRow
                      key={type.id}
                      tabIndex={canManage ? 0 : undefined}
                      aria-label={canManage ? `Editar ${type.name}` : type.name}
                      onClick={() => {
                        if (canManage) setEditor({ mode: "edit", type })
                      }}
                      onKeyDown={(e) => {
                        if (!canManage) return
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setEditor({ mode: "edit", type })
                        }
                      }}
                      className={cn(
                        "border-0 transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]",
                        canManage && "cursor-pointer"
                      )}
                    >
                      <TableCell className="max-w-0 py-4 pl-4 whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-[15px] font-medium",
                              inactive ? "text-white/55" : "text-foreground"
                            )}
                          >
                            {type.name}
                          </span>
                          {type.promoBuy != null && type.promoPay != null ? (
                            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-white/65 tabular-nums">
                              {type.promoBuy}×{type.promoPay}
                            </span>
                          ) : null}
                        </div>
                        {admission ? (
                          <span className="mt-1 flex items-center gap-1.5 text-[12px] text-white/50">
                            <Clock3 className="h-3 w-3 shrink-0" />
                            {admission}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-4 text-[15px] font-medium text-white/80 tabular-nums whitespace-nowrap">
                        {formatPrice(type.price)}
                      </TableCell>
                      <TableCell className="py-4 tabular-nums whitespace-nowrap">
                        <span className="text-[14px] text-white/70">
                          {type.sold.toLocaleString("es-AR")}
                          <span className="text-white/45">
                            {" / "}
                            {type.stockLimit == null ? "∞" : type.stockLimit.toLocaleString("es-AR")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block text-[12px]",
                            type.remaining === 0 ? "text-amber-300/80" : "text-white/50"
                          )}
                        >
                          {availabilityCaption(type)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span
                          className={cn(
                            "text-[12px] font-normal lowercase",
                            inactive ? "text-white/45" : "text-white/65"
                          )}
                        >
                          {inactive ? "inactiva" : "activa"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 pr-4 text-right">
                        {canManage ? (
                          <ChevronRight className="ml-auto h-4 w-4 text-white/25" aria-hidden />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06] sm:hidden">
            {types.map((type) => {
              const admission = admissionSummary(type)
              const inactive = type.isActive === false
              return (
                <li key={type.id}>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setEditor({ mode: "edit", type })}
                    aria-label={`Editar ${type.name}`}
                    className="flex w-full items-start justify-between gap-4 py-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500] disabled:cursor-default"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-[15px] font-medium",
                            inactive ? "text-white/55" : "text-foreground"
                          )}
                        >
                          {type.name}
                        </span>
                        {type.promoBuy != null && type.promoPay != null ? (
                          <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-white/65 tabular-nums">
                            {type.promoBuy}×{type.promoPay}
                          </span>
                        ) : null}
                        {inactive ? (
                          <span className="text-[11px] font-normal lowercase text-white/50">
                            inactiva
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] tabular-nums">
                        <span className="text-white/75">{formatPrice(type.price)}</span>
                        <span className="text-white/20" aria-hidden>
                          ·
                        </span>
                        <span className="text-white/55">
                          {type.sold.toLocaleString("es-AR")} /{" "}
                          {type.stockLimit == null ? "∞" : type.stockLimit.toLocaleString("es-AR")}
                        </span>
                        <span
                          className={cn(
                            type.remaining === 0 ? "text-amber-300/80" : "text-white/50"
                          )}
                        >
                          {availabilityCaption(type)}
                        </span>
                      </span>
                      {admission ? (
                        <span className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-white/50">
                          <Clock3 className="mt-0.5 h-3 w-3 shrink-0" />
                          {admission}
                        </span>
                      ) : null}
                    </span>
                    {canManage ? (
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/25" aria-hidden />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
