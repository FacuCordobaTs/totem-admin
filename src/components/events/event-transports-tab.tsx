import { useCallback, useEffect, useState, type FormEvent } from "react"
import Decimal from "decimal.js"
import { Bus, Plus, Pencil, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { LocationPicker } from "./location-picker"

type Transport = {
  id: string
  name: string
  address: string
  latitude: string
  longitude: string
  price: string
  isActive: boolean
}
type Booking = {
  id: string
  transportId: string
  name: string
  quantity: number
  price: string
  customerName: string
  customerDni: string | null
  customerPhone: string | null
}
const field =
  "h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-white outline-none focus:border-white/40"
function money(value: string) {
  return (
    "$ " +
    new Decimal(value)
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  )
}

export function EventTransportsTab({ eventId }: { eventId: string }) {
  const token = useAuthStore((s) => s.token)
  const [transports, setTransports] = useState<Transport[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Transport | null>(null)
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [price, setPrice] = useState("")
  const [active, setActive] = useState(true)
  const [point, setPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<{
        transports: Transport[]
        bookings: Booking[]
      }>(`/event-transports/${eventId}`, { token })
      setTransports(data.transports)
      setBookings(data.bookings)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los transportes"
      )
    } finally {
      setLoading(false)
    }
  }, [token, eventId])
  useEffect(() => {
    void load()
  }, [load])
  const edit = (transport: Transport | null) => {
    setEditing(transport)
    setName(transport?.name ?? "")
    setAddress(transport?.address ?? "")
    setPrice(transport?.price ?? "")
    setActive(transport?.isActive ?? true)
    setPoint(
      transport
        ? {
            latitude: Number(transport.latitude),
            longitude: Number(transport.longitude)
          }
        : null
    )
    setSaveError(null)
    setOpen(true)
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !point || busy) return
    const amount = price.trim().replace(",", ".")
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || new Decimal(amount).lte(0)) {
      setSaveError(
        "Ingresá el precio sin separador de miles, por ejemplo 18000"
      )
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      await apiFetch(
        `/event-transports/${eventId}${editing ? `/${editing.id}` : ""}`,
        {
          token,
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            address,
            price: amount,
            ...point,
            isActive: active
          })
        }
      )
      setOpen(false)
      await load()
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "No se pudo guardar el transporte"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-lg text-sm text-white/60">
          Creá las salidas que se ofrecen junto a las entradas. El precio es por
          persona.
        </p>
        <Button onClick={() => edit(null)} className="gap-2">
          <Plus className="size-4" />
          Nuevo transporte
        </Button>
      </div>
      {loading ? (
        <Loader2 className="size-5 animate-spin text-white/50" />
      ) : error ? (
        <div role="alert" className="text-red-400">
          {error}{" "}
          <button onClick={() => void load()} className="underline">
            Reintentar
          </button>
        </div>
      ) : transports.length === 0 ? (
        <p className="py-8 text-center text-white/45">
          Todavía no hay transportes asignados a este evento.
        </p>
      ) : (
        <div className="space-y-3">
          {transports.map((transport) => (
            <div
              key={transport.id}
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <Bus className="mt-1 size-5 shrink-0 text-orange-400" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white">{transport.name}</h3>
                <p className="mt-1 break-words text-sm text-white/60">
                  {transport.address}
                </p>
                <p className="mt-2 text-sm text-white">
                  {money(transport.price)} por persona{" "}
                  <span className="ml-2 text-white/40">
                    {transport.isActive ? "En venta" : "Fuera de venta"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {bookings
                    .filter((b) => b.transportId === transport.id)
                    .reduce((n, b) => n + b.quantity, 0)}{" "}
                  pasajes pagados
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => edit(transport)}
                aria-label={`Editar ${transport.name}`}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {bookings.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-white">
            Pasajeros con pago confirmado
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/45">
                <tr>
                  {["Transporte", "Comprador", "DNI", "Celular", "Pasajes"].map(
                    (label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-white/10 text-white/80"
                  >
                    <td className="p-3">{b.name}</td>
                    <td className="p-3">{b.customerName}</td>
                    <td className="p-3">{b.customerDni ?? "—"}</td>
                    <td className="p-3">{b.customerPhone ?? "—"}</td>
                    <td className="p-3">{b.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar transporte" : "Nuevo transporte"}
            </DialogTitle>
            <DialogDescription>
              Indicá el precio y el punto de salida. Las compras ya pagadas
              conservan sus datos originales.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <label className="block space-y-2 text-sm">
              Nombre
              <input
                className={field}
                required
                maxLength={255}
                placeholder="Desde Santo Tomé"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm">
              Precio por persona (ARS)
              <input
                className={field}
                required
                inputMode="decimal"
                placeholder="18000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <div className="space-y-2">
              <label htmlFor="transport-location" className="text-sm">
                Dirección del punto de salida
              </label>
              <LocationPicker
                id="transport-location"
                className={field}
                value={address}
                onChange={(value) => {
                  setAddress(value)
                  setPoint(null)
                }}
                onSelect={setPoint}
                coordinates={point}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Disponible para comprar
            </label>
            {saveError && (
              <p role="alert" className="text-sm text-red-400">
                {saveError}
              </p>
            )}
            <Button type="submit" disabled={!point || busy} className="w-full">
              {busy ? "Guardando…" : "Guardar transporte"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
