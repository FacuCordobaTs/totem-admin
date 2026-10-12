import { useCallback, useEffect, useState, type FormEvent } from "react"
import Decimal from "decimal.js"
import {
  Bus,
  Plus,
  Pencil,
  Loader2,
  Download,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  Check,
  RefreshCw
} from "lucide-react"
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
import { getTransportDriverUrl } from "@/lib/client-app-url"
import {
  downloadTransportPassengers,
  type TransportPassengerBooking
} from "@/lib/transport-passenger-export"

type Transport = {
  id: string
  name: string
  address: string
  latitude: string
  longitude: string
  price: string
  isActive: boolean
}
type Booking = TransportPassengerBooking
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
  const [driverTransport, setDriverTransport] = useState<Transport | null>(null)
  const [driverUrl, setDriverUrl] = useState("")
  const [driverBusy, setDriverBusy] = useState(false)
  const [driverError, setDriverError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [passengerFilter, setPassengerFilter] = useState("")
  const visibleBookings = passengerFilter
    ? bookings.filter((b) => b.transportId === passengerFilter)
    : bookings
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
  const generateDriverLink = async (transport: Transport) => {
    if (!token || driverBusy) return
    setDriverTransport(transport)
    setDriverUrl("")
    setCopied(false)
    setDriverError(null)
    setDriverBusy(true)
    try {
      const data = await apiFetch<{ token: string }>(
        `/event-transports/${eventId}/${transport.id}/driver-link`,
        { token, method: "POST" }
      )
      setDriverUrl(getTransportDriverUrl(data.token))
    } catch (err) {
      setDriverError(
        err instanceof Error ? err.message : "No se pudo generar el link"
      )
    } finally {
      setDriverBusy(false)
    }
  }
  const copyDriverLink = async () => {
    try {
      await navigator.clipboard.writeText(driverUrl)
      setCopied(true)
      setDriverError(null)
    } catch {
      setDriverError("Copiá el link desde el campo de arriba.")
    }
  }
  const disableDriverLink = async () => {
    if (!token || !driverTransport || driverBusy) return
    setDriverBusy(true)
    setDriverError(null)
    try {
      await apiFetch(
        `/event-transports/${eventId}/${driverTransport.id}/driver-link`,
        { token, method: "DELETE" }
      )
      setDriverUrl("")
      setCopied(false)
    } catch (err) {
      setDriverError(
        err instanceof Error ? err.message : "No se pudo desactivar el link"
      )
    } finally {
      setDriverBusy(false)
    }
  }
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => void load()}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar lista
          </Button>
          <Button onClick={() => edit(null)} className="gap-2">
            <Plus className="size-4" />
            Nuevo transporte
          </Button>
        </div>
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={
                      !bookings.some((b) => b.transportId === transport.id)
                    }
                    onClick={() =>
                      downloadTransportPassengers(
                        bookings.filter((b) => b.transportId === transport.id),
                        `pasajeros-${transport.id.slice(0, 8)}.csv`
                      )
                    }
                  >
                    <Download className="size-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={driverBusy}
                    onClick={() => void generateDriverLink(transport)}
                  >
                    <LinkIcon className="size-4" />
                    Link para chofer
                  </Button>
                </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              Pasajeros con pago confirmado
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={visibleBookings.length === 0}
              onClick={() =>
                downloadTransportPassengers(
                  visibleBookings,
                  `pasajeros-transporte-${eventId.slice(0, 8)}.csv`
                )
              }
            >
              <Download className="size-4" />
              Exportar lista
            </Button>
          </div>
          <label className="block max-w-sm space-y-2 text-sm text-white/60">
            Filtrar por transporte
            <select
              className={field}
              value={passengerFilter}
              onChange={(e) => setPassengerFilter(e.target.value)}
            >
              <option value="">Todos los transportes</option>
              {transports.map((transport) => (
                <option key={transport.id} value={transport.id}>
                  {transport.name}
                </option>
              ))}
            </select>
          </label>
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
                {visibleBookings.map((b) => (
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
        open={driverTransport !== null}
        onOpenChange={(next) => {
          if (!next && !driverBusy) setDriverTransport(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista para el chofer</DialogTitle>
            <DialogDescription>
              {driverTransport?.name}. Quien tenga este link puede ver los
              pasajeros de esta salida. Las marcas de subida se guardan en el
              navegador de cada chofer.
            </DialogDescription>
          </DialogHeader>
          {driverBusy ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="size-4 animate-spin" />
              Actualizando link…
            </div>
          ) : driverUrl ? (
            <div className="space-y-4">
              <label className="block space-y-2 text-sm">
                Link de pasajeros
                <input
                  value={driverUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  className={field}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={() => void copyDriverLink()}>
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <a href={driverUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    Abrir lista
                  </a>
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void disableDriverLink()}
              >
                Desactivar link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                Esta salida no tiene un link activo.
              </p>
              <Button
                onClick={() =>
                  driverTransport && void generateDriverLink(driverTransport)
                }
              >
                Generar link
              </Button>
            </div>
          )}
          {driverError && (
            <p role="alert" className="text-sm text-red-400">
              {driverError}
            </p>
          )}
        </DialogContent>
      </Dialog>
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
