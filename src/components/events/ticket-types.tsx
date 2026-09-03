import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { ChevronDown, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type ApiTier = {
  id: string
  name: string
  price: string
  position: number
  stockLimit: number | null
  activeFrom: string | null
  activeUntil: string | null
}

export type ApiTicketType = {
  id: string
  eventId: string
  tenantId: string
  name: string
  price: string
  stockLimit: number | null
  sold: number
  remaining: number | null
  courtesies?: number
  effectivePrice?: string
  tiers?: ApiTier[]
  activeTier?: { id: string; name: string; price: string; remaining: number | null } | null
}

type TicketTypesResponse = { ticketTypes: ApiTicketType[] }

type TicketTypesProps = {
  eventId: string
  refreshTrigger: number
  onChanged?: () => void
  /** Reporta cuántos tipos hay cargados (para ocultar el resto de Entradas hasta tener ≥1). */
  onCountChange?: (count: number) => void
}

function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? Number.parseFloat(price) : price
  if (Number.isNaN(n)) return "—"
  return (
    "$ " +
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n))
  )
}

function parsePrice(v: string): number | null {
  const n = Number(v.replace(",", "."))
  return Number.isNaN(n) || n < 0 ? null : n
}

function parseStock(v: string): { value: number | null; ok: boolean } {
  if (v.trim() === "") return { value: null, ok: true }
  const n = parseInt(v, 10)
  if (Number.isNaN(n) || n < 1) return { value: null, ok: false }
  return { value: n, ok: true }
}

const fieldClass =
  "h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors focus:border-white/25"

// ───────────────────────────────────────────────────────────────────────────
// Editor de tandas: la escalera se escribe como frase que se completa. El sistema
// la ejecuta solo (backend, evaluación perezosa). Se reemplaza entera vía PUT.
// ───────────────────────────────────────────────────────────────────────────

type TierDraft = {
  name: string
  price: string
  stockLimit: string
}

function tierToDraft(t: ApiTier): TierDraft {
  return {
    name: t.name,
    price: String(Number.parseFloat(t.price)),
    stockLimit: t.stockLimit != null ? String(t.stockLimit) : "",
  }
}

function TierLadder({
  eventId,
  type,
  onChanged,
}: {
  eventId: string
  type: ApiTicketType
  onChanged: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [drafts, setDrafts] = useState<TierDraft[]>(
    () => (type.tiers ?? []).map(tierToDraft)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef<string>(JSON.stringify((type.tiers ?? []).map(tierToDraft)))

  const persist = useCallback(
    async (next: TierDraft[]) => {
      if (!token) return
      const clean = next
        .map((d) => ({
          name: d.name.trim(),
          price: parsePrice(d.price),
          stock: parseStock(d.stockLimit),
        }))
        .filter((d) => d.name !== "")
      // No persistir si hay algún precio/cupo inválido en una fila con nombre.
      if (clean.some((d) => d.price == null || !d.stock.ok)) {
        setError("Revisá precio o cupo de la escalera")
        return
      }
      setError(null)
      const payload = {
        tiers: clean.map((d) => ({
          name: d.name,
          price: d.price as number,
          stockLimit: d.stock.value,
        })),
      }
      const sig = JSON.stringify(next)
      if (sig === lastSaved.current) return
      setSaving(true)
      try {
        await apiFetch(`/events/${eventId}/ticket-types/${type.id}/tiers`, {
          method: "PUT",
          token,
          body: JSON.stringify(payload),
        })
        lastSaved.current = sig
        onChanged()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo guardar la escalera")
      } finally {
        setSaving(false)
      }
    },
    [token, eventId, type.id, onChanged]
  )

  function update(i: number, patch: Partial<TierDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }
  function addTier() {
    setDrafts((prev) => [...prev, { name: "", price: "", stockLimit: "" }])
  }
  function removeTier(i: number) {
    setDrafts((prev) => {
      const next = prev.filter((_, idx) => idx !== i)
      void persist(next)
      return next
    })
  }

  const activeId = type.activeTier?.id ?? null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-white/35">
          Tandas
        </span>
        <span aria-live="polite" className="text-[11px] text-white/30">
          {saving ? "Guardando…" : error ? "" : ""}
        </span>
      </div>

      {drafts.length === 0 ? (
        <p className="text-[13px] text-white/35">
          Precio único: {formatPrice(type.price)}. Agregá una tanda para armar una escalera
          (ej: Early → General).
        </p>
      ) : (
        <div className="space-y-1.5">
          {drafts.map((d, i) => {
            const originalId = type.tiers?.[i]?.id
            const isActive = originalId != null && originalId === activeId
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                  isActive
                    ? "border-[#FF9500]/40 bg-[#FF9500]/[0.06]"
                    : "border-white/[0.06] bg-white/[0.02]"
                )}
              >
                <span className="w-5 shrink-0 text-center text-[12px] text-white/25">
                  {i + 1}
                </span>
                <input
                  value={d.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  onBlur={() => persist(drafts)}
                  placeholder="Nombre"
                  className={cn(fieldClass, "flex-1")}
                />
                <input
                  value={d.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                  onBlur={() => persist(drafts)}
                  inputMode="decimal"
                  placeholder="Precio"
                  className={cn(fieldClass, "w-24")}
                />
                <input
                  value={d.stockLimit}
                  onChange={(e) => update(i, { stockLimit: e.target.value })}
                  onBlur={() => persist(drafts)}
                  inputMode="numeric"
                  placeholder="Cupos"
                  className={cn(fieldClass, "w-20")}
                />
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="shrink-0 rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-red-400"
                  aria-label="Quitar tanda"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error ? <p className="text-[12px] text-red-400">{error}</p> : null}

      <button
        type="button"
        onClick={addTier}
        className="inline-flex items-center gap-1 text-[13px] text-white/45 transition-colors hover:text-white/70"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar tanda
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Fila de un tipo de entrada: pieza horizontal que se abre para su profundidad.
// Edición al blur (sin "Guardar"): PATCH del tipo. Adentro, el editor de tandas.
// ───────────────────────────────────────────────────────────────────────────

function TypeRow({
  eventId,
  type,
  expanded,
  onToggle,
  onChanged,
  canManage,
}: {
  eventId: string
  type: ApiTicketType
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
  canManage: boolean
}) {
  const token = useAuthStore((s) => s.token)
  const [name, setName] = useState(type.name)
  const [price, setPrice] = useState(String(Number.parseFloat(type.price)))
  const [stock, setStock] = useState(type.stockLimit != null ? String(type.stockLimit) : "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>("")

  useEffect(() => {
    setName(type.name)
    setPrice(String(Number.parseFloat(type.price)))
    setStock(type.stockLimit != null ? String(type.stockLimit) : "")
    lastSaved.current = JSON.stringify({
      name: type.name,
      price: String(Number.parseFloat(type.price)),
      stock: type.stockLimit != null ? String(type.stockLimit) : "",
    })
  }, [type.id, type.name, type.price, type.stockLimit])

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const persist = useCallback(async () => {
    if (!token) return
    const parsedPrice = parsePrice(price)
    const parsedStock = parseStock(stock)
    if (name.trim() === "") {
      setError("El nombre no puede quedar vacío")
      return
    }
    if (parsedPrice == null) {
      setError("Precio inválido")
      return
    }
    if (!parsedStock.ok) {
      setError("El cupo debe ser un entero positivo o vacío")
      return
    }
    const sig = JSON.stringify({ name: name.trim(), price, stock })
    if (sig === lastSaved.current) {
      setError(null)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${type.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: name.trim(),
          price: parsedPrice,
          stockLimit: parsedStock.value,
        }),
      })
      lastSaved.current = sig
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }, [token, eventId, type.id, name, price, stock, onChanged])

  async function remove() {
    if (!token) return
    if (!confirm(`¿Eliminar el tipo "${type.name}"?`)) return
    setError(null)
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${type.id}`, {
        method: "DELETE",
        token,
      })
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar")
    }
  }

  const soldText =
    type.stockLimit == null
      ? `${type.sold} vendidas`
      : `${type.sold} / ${type.stockLimit}`
  const displayPrice = type.effectivePrice ?? type.price

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-medium text-white">
              {type.name}
            </span>
            {type.activeTier ? (
              <span className="shrink-0 rounded-full bg-[#FF9500]/15 px-2 py-0.5 text-[11px] font-medium text-[#FF9500]">
                {type.activeTier.name}
              </span>
            ) : null}
          </div>
          <span className="text-[13px] text-white/40">{soldText}</span>
        </div>
        <span className="shrink-0 text-[16px] font-semibold text-white">
          {formatPrice(displayPrice)}
        </span>
        {canManage ? (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-white/30 transition-transform",
              expanded && "rotate-180"
            )}
          />
        ) : null}
      </button>

      {expanded && canManage ? (
        <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-white/35">nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={persist}
                className={fieldClass}
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-[11px] text-white/35">precio base</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={persist}
                inputMode="decimal"
                className={fieldClass}
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-[11px] text-white/35">cupo</label>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                onBlur={persist}
                inputMode="numeric"
                placeholder="∞"
                className={fieldClass}
              />
            </div>
          </div>

          <TierLadder eventId={eventId} type={type} onChanged={onChanged} />

          <div className="flex items-center justify-between">
            <span aria-live="polite" className="text-[12px]">
              {saving ? (
                <span className="text-white/40">Guardando…</span>
              ) : saved ? (
                <span className="text-emerald-400">Guardado</span>
              ) : error ? (
                <span className="text-red-400">{error}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-1.5 text-[13px] text-white/40 transition-colors hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar tipo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Crear inline (spec §4.2): el formulario se despliega sobre su propio disparador.
// ───────────────────────────────────────────────────────────────────────────

function InlineCreate({
  eventId,
  onCreated,
}: {
  eventId: string
  onCreated: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const createRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const focusInput = window.setTimeout(() => nameInputRef.current?.focus(), 150)
    return () => window.clearTimeout(focusInput)
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!createRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open, saving])

  function close() {
    if (saving) return
    setOpen(false)
    setError(null)
  }

  async function create() {
    if (!token || saving) return
    if (name.trim() === "") return
    const parsedPrice = parsePrice(price)
    if (parsedPrice == null) {
      setError("Precio inválido")
      return
    }
    const parsedStock = parseStock(stock)
    if (!parsedStock.ok) {
      setError("Cupo inválido")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await apiFetch(`/events/${eventId}/ticket-types`, {
        method: "POST",
        token,
        body: JSON.stringify({
          name: name.trim(),
          price: parsedPrice,
          stockLimit: parsedStock.value,
        }),
      })
      setName("")
      setPrice("")
      setStock("")
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={createRef} className="relative h-15">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-15 w-full items-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-4 text-[15px] text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
      >
        <Plus className="h-4 w-4 shrink-0" />
        Nuevo tipo
      </button>

      {open ? (
        <div
          className="absolute inset-x-0 bottom-0 z-10 origin-bottom-left animate-in fade-in-0 zoom-in-95 duration-200"
          onKeyDown={(e) => {
            if (e.key === "Escape") close()
          }}
        >
          <div className="flex min-h-20 items-center gap-2 rounded-xl border border-white/[0.12] bg-black px-4 py-2.5 shadow-2xl shadow-black/80 sm:min-w-[560px]">
            <Plus className="h-4 w-4 shrink-0 text-white/30" />
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create()
              }}
              placeholder="+ Nuevo tipo"
              className={cn(fieldClass, "flex-1 border-transparent bg-transparent px-0")}
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create()
              }}
              inputMode="decimal"
              placeholder="Precio"
              className="h-10 w-24 rounded-lg bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors focus:bg-white/[0.08]"
            />
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create()
              }}
              inputMode="numeric"
              placeholder="Cupo"
              className="h-10 w-20 rounded-lg bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors focus:bg-white/[0.08]"
            />
            <button
              type="button"
              onClick={create}
              disabled={saving || name.trim() === ""}
              className="h-10 shrink-0 rounded-lg bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {saving ? "…" : "Crear"}
            </button>
          </div>
          {error ? <p className="mt-1.5 text-[12px] text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export function TicketTypes({ eventId, refreshTrigger, onChanged, onCountChange }: TicketTypesProps) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"

  const [types, setTypes] = useState<ApiTicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<TicketTypesResponse>(
        `/events/${eventId}/ticket-types`,
        { method: "GET", token }
      )
      setTypes(data.ticketTypes)
      onCountChange?.(data.ticketTypes.length)
    } catch (err) {
      setTypes([])
      onCountChange?.(0)
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los tipos")
    } finally {
      setLoading(false)
    }
  }, [token, eventId, onCountChange])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  const handleChanged = useCallback(() => {
    void load()
    onChanged?.()
  }, [load, onChanged])

  return (
    <section className="w-full">
      <h2 className="mb-4 text-2xl font-medium tracking-tight text-foreground">
        Tipos de entrada
      </h2>

      {error ? (
        <p className="py-3 text-[15px] text-red-400">{error}</p>
      ) : loading ? (
        <p className="py-3 text-[15px] text-white/40">Cargando tipos…</p>
      ) : (
        <div className="space-y-2">
          {canManage ? (
            <InlineCreate eventId={eventId} onCreated={handleChanged} />
          ) : null}
          {types.map((t) => (
            <TypeRow
              key={t.id}
              eventId={eventId}
              type={t}
              expanded={expandedId === t.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === t.id ? null : t.id))
              }
              onChanged={handleChanged}
              canManage={canManage}
            />
          ))}
          {!canManage && types.length === 0 ? (
            <p className="py-3 text-[15px] text-white/40">
              No hay tipos de entrada.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
