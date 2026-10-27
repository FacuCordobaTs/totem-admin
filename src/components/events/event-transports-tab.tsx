import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Decimal from "decimal.js"
import { Link } from "react-router"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw
} from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { LocationPicker } from "./location-picker"
import { getTransportDriverUrl } from "@/lib/client-app-url"
import {
  downloadTransportPassengers,
  type TransportPassengerBooking
} from "@/lib/transport-passenger-export"
import { useEventNestedView } from "./event-mobile-nav"

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

const fieldInputClass =
  "h-11 rounded-xl border-0 bg-white/[0.06] px-3 text-[15px] text-white placeholder:text-white/25 shadow-none focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"
const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const outlineButtonClass =
  "h-10 rounded-xl bg-white/[0.06] px-4 text-white/80 hover:bg-white/[0.1] hover:text-white"
const tableHeadClass = "text-[11px] font-normal lowercase text-white/45"

function money(value: string) {
  return (
    "$ " +
    new Decimal(value)
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  )
}

function paidPassengers(bookings: Booking[]): number {
  return bookings.reduce((total, booking) => total + booking.quantity, 0)
}

export function EventTransportsTab({ eventId }: { eventId: string }) {
  const token = useAuthStore((s) => s.token)
  const [transports, setTransports] = useState<Transport[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => transports.find((transport) => transport.id === selectedId) ?? null,
    [transports, selectedId]
  )

  const [editOpen, setEditOpen] = useState(false)
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

  const [passengerFilter, setPassengerFilter] = useState("all")
  const visibleBookings =
    passengerFilter === "all"
      ? bookings
      : bookings.filter((booking) => booking.transportId === passengerFilter)

  const editingPage = editOpen && editing !== null
  useEventNestedView(selected !== null || editingPage)

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
    setEditOpen(true)
    if (transport) window.scrollTo({ top: 0, behavior: "auto" })
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
      setEditOpen(false)
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
    <div className="space-y-10">
      {editingPage ? (
        <TransportEditor
          name={name}
          onNameChange={setName}
          price={price}
          onPriceChange={setPrice}
          address={address}
          onAddressChange={setAddress}
          active={active}
          onActiveChange={setActive}
          point={point}
          onPointChange={setPoint}
          busy={busy}
          error={saveError}
          onSubmit={save}
          onCancel={() => setEditOpen(false)}
        />
      ) : selected ? (
        <TransportDetail
          transport={selected}
          bookings={bookings.filter(
            (booking) => booking.transportId === selected.id
          )}
          driverBusy={driverBusy}
          driverUrl={driverTransport?.id === selected.id ? driverUrl : ""}
          onBack={() => setSelectedId(null)}
          onEdit={() => edit(selected)}
          onGenerateDriverLink={() => void generateDriverLink(selected)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-lg text-[13px] leading-relaxed text-white/45">
              Creá las salidas que se ofrecen junto a las entradas. El precio es por
              persona.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant="ghost"
                className="h-9 rounded-xl px-3 text-[13px] font-medium text-white/55 hover:bg-white/[0.06] hover:text-white"
              >
                <Link to="/scanner-transporte">Escáner de transporte</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Actualizar lista"
                disabled={loading}
                onClick={() => void load()}
                className="size-9 rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white"
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                type="button"
                onClick={() => edit(null)}
                className={primaryButtonClass}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nuevo transporte
              </Button>
            </div>
          </div>
    
          {loading ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Cargando transportes…</span>
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-14 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="space-y-3">
              <p className="text-[14px] text-rose-300">{error}</p>
              <Button variant="outline" onClick={() => void load()} className={outlineButtonClass}>
                Reintentar
              </Button>
            </div>
          ) : transports.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.02] px-5 py-12 text-center">
              <p className="text-[15px] font-medium text-white">
                Todavía no hay transportes en este evento
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/45">
                Creá la primera salida para vender pasajes junto a las entradas.
              </p>
              <Button onClick={() => edit(null)} className={`${primaryButtonClass} mt-5`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Crear transporte
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-white/45">
                {transports.length}{" "}
                {transports.length === 1 ? "salida" : "salidas"} ·{" "}
                {paidPassengers(bookings)}{" "}
                {paidPassengers(bookings) === 1 ? "pasaje pagado" : "pasajes pagados"}
              </p>
              <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
                <Table className="table-fixed md:table-auto">
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                      <TableHead className={`w-[58%] pl-4 md:w-auto ${tableHeadClass}`}>
                        Transporte
                      </TableHead>
                      <TableHead className={`text-right ${tableHeadClass}`}>
                        Precio
                      </TableHead>
                      <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                        Pasajes
                      </TableHead>
                      <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
                        Estado
                      </TableHead>
                      <TableHead className="w-10 pr-4">
                        <span className="sr-only">Abrir transporte</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
                    {transports.map((transport) => (
                      <TableRow
                        key={transport.id}
                        tabIndex={0}
                        aria-label={`Abrir ${transport.name}`}
                        onClick={() => setSelectedId(transport.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setSelectedId(transport.id)
                          }
                        }}
                        className="cursor-pointer border-0 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF9500]"
                      >
                        <TableCell className="py-3.5 pl-4">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span
                              className="truncate text-[15px] font-medium text-white"
                              title={transport.name}
                            >
                              {transport.name}
                            </span>
                            <span
                              className="hidden min-w-0 truncate text-[12px] text-white/35 sm:inline"
                              title={transport.address}
                            >
                              {transport.address}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3.5 text-right text-[14px] font-medium tabular-nums text-white/80">
                          {money(transport.price)}
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-[13px] tabular-nums text-white/45 md:table-cell">
                          {paidPassengers(
                            bookings.filter(
                              (booking) => booking.transportId === transport.id
                            )
                          )}
                        </TableCell>
                        <TableCell className="hidden py-3.5 text-[12px] text-white/45 md:table-cell">
                          {transport.isActive ? "En venta" : "Fuera de venta"}
                        </TableCell>
                        <TableCell className="py-3.5 pr-4">
                          <ArrowRight
                            className="ml-auto h-4 w-4 text-white/25"
                            aria-hidden="true"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
    
          {bookings.length > 0 ? (
            <section className="space-y-4" aria-labelledby="transport-passengers-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="transport-passengers-title"
                    className="text-lg font-semibold text-white"
                  >
                    Pasajeros
                  </h2>
                  <p className="mt-1 text-[13px] text-white/45">
                    Pasajes con pago confirmado de todas las salidas.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={passengerFilter} onValueChange={setPassengerFilter}>
                    <SelectTrigger
                      aria-label="Filtrar pasajeros por transporte"
                      className="h-9 min-w-[170px] rounded-xl border-0 bg-white/[0.06] px-3 text-[13px] text-foreground shadow-none"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">Todos los transportes</SelectItem>
                      {transports.map((transport) => (
                        <SelectItem key={transport.id} value={transport.id}>
                          {transport.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={visibleBookings.length === 0}
                    onClick={() =>
                      downloadTransportPassengers(
                        visibleBookings,
                        `pasajeros-transporte-${eventId.slice(0, 8)}.csv`
                      )
                    }
                    className="h-9 rounded-xl px-3 text-[13px] font-medium text-white/55 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Exportar
                  </Button>
                </div>
              </div>
              <PassengerTable
                bookings={visibleBookings}
                emptyLabel="No hay pasajeros para este filtro."
              />
            </section>
          ) : null}
        </>
      )}

      <Dialog
        open={driverTransport !== null}
        onOpenChange={(next) => {
          if (!next && !driverBusy) setDriverTransport(null)
        }}
      >
        <DialogContent className="bg-background sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista para el chofer</DialogTitle>
            <DialogDescription>
              {driverTransport?.name}. Quien tenga este link puede ver los
              pasajeros de esta salida y consultar quiénes subieron. Para
              registrar subidas, asigná el rol Transportista desde Equipo y usá
              el escáner.
            </DialogDescription>
          </DialogHeader>
          {driverBusy ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="size-4 animate-spin" />
              Actualizando link…
            </div>
          ) : driverUrl ? (
            <div className="space-y-4">
              <label className="block space-y-2 text-[13px] text-white/60">
                Link de pasajeros
                <Input
                  value={driverUrl}
                  readOnly
                  onFocus={(event) => event.target.select()}
                  className={fieldInputClass}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => void copyDriverLink()}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Copy className="mr-1.5 h-4 w-4" />
                  )}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <Button asChild variant="outline" className={outlineButtonClass}>
                  <a href={driverUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    Abrir lista
                  </a>
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void disableDriverLink()}
                className="text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300"
              >
                Desactivar link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                Generá un link para abrir y compartir la lista de esta salida.
              </p>
              <Button
                type="button"
                className={primaryButtonClass}
                onClick={() =>
                  driverTransport && void generateDriverLink(driverTransport)
                }
              >
                Generar link
              </Button>
            </div>
          )}
          {driverError ? (
            <p role="alert" className="text-sm text-rose-300">
              {driverError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen && editing === null}
        onOpenChange={(next) => {
          if (!busy) setEditOpen(next)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo transporte</DialogTitle>
            <DialogDescription>
              Indicá el precio y el punto de salida. Las compras ya pagadas
              conservan sus datos originales.
            </DialogDescription>
          </DialogHeader>
          <TransportForm
            name={name}
            onNameChange={setName}
            price={price}
            onPriceChange={setPrice}
            address={address}
            onAddressChange={setAddress}
            active={active}
            onActiveChange={setActive}
            point={point}
            onPointChange={setPoint}
            busy={busy}
            error={saveError}
            onSubmit={save}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TransportEditor({
  name,
  onNameChange,
  price,
  onPriceChange,
  address,
  onAddressChange,
  active,
  onActiveChange,
  point,
  onPointChange,
  busy,
  error,
  onSubmit,
  onCancel
}: {
  name: string
  onNameChange: (value: string) => void
  price: string
  onPriceChange: (value: string) => void
  address: string
  onAddressChange: (value: string) => void
  active: boolean
  onActiveChange: (value: boolean) => void
  point: { latitude: number; longitude: number } | null
  onPointChange: (value: { latitude: number; longitude: number } | null) => void
  busy: boolean
  error: string | null
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <section className="w-full" aria-labelledby="transport-editor-title">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Transporte
        </button>
        <div>
          <h2
            id="transport-editor-title"
            className="text-2xl font-bold tracking-tight text-white"
          >
            Editar transporte
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-white/45">
            Indicá el precio y el punto de salida. Las compras ya pagadas
            conservan sus datos originales.
          </p>
        </div>
      </header>
      <div className="mt-7 max-w-3xl">
        <TransportForm
          name={name}
          onNameChange={onNameChange}
          price={price}
          onPriceChange={onPriceChange}
          address={address}
          onAddressChange={onAddressChange}
          active={active}
          onActiveChange={onActiveChange}
          point={point}
          onPointChange={onPointChange}
          busy={busy}
          error={error}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </div>
    </section>
  )
}

function TransportForm({
  name,
  onNameChange,
  price,
  onPriceChange,
  address,
  onAddressChange,
  active,
  onActiveChange,
  point,
  onPointChange,
  busy,
  error,
  onSubmit,
  onCancel
}: {
  name: string
  onNameChange: (value: string) => void
  price: string
  onPriceChange: (value: string) => void
  address: string
  onAddressChange: (value: string) => void
  active: boolean
  onActiveChange: (value: boolean) => void
  point: { latitude: number; longitude: number } | null
  onPointChange: (value: { latitude: number; longitude: number } | null) => void
  busy: boolean
  error: string | null
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-label="Transporte">
      <Field label="Nombre">
        <Input
          required
          maxLength={255}
          placeholder="Desde Santo Tomé"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className={fieldInputClass}
        />
      </Field>
      <Field label="Precio por persona (ARS)">
        <Input
          required
          inputMode="decimal"
          placeholder="18000"
          value={price}
          onChange={(event) => onPriceChange(event.target.value)}
          className={fieldInputClass}
        />
      </Field>
      <div className="space-y-2">
        <label
          htmlFor="transport-location"
          className="text-[13px] font-medium text-white/70"
        >
          Dirección del punto de salida
        </label>
        <LocationPicker
          id="transport-location"
          className={fieldInputClass}
          value={address}
          onChange={(value) => {
            onAddressChange(value)
            onPointChange(null)
          }}
          onSelect={onPointChange}
          coordinates={point}
        />
      </div>
      <label className="flex items-center gap-2 text-[13px] text-white/70">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onActiveChange(event.target.checked)}
          className="size-4 rounded border-white/20 bg-transparent accent-[#FF9500]"
        />
        Disponible para comprar
      </label>
      {error ? (
        <p role="alert" className="text-[13px] text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          className="text-white/60 hover:text-white"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!point || busy}
          className={primaryButtonClass}
        >
          {busy ? "Guardando…" : "Guardar transporte"}
        </Button>
      </div>
    </form>
  )
}

function TransportDetail({
  transport,
  bookings,
  driverBusy,
  driverUrl,
  onBack,
  onEdit,
  onGenerateDriverLink
}: {
  transport: Transport
  bookings: Booking[]
  driverBusy: boolean
  driverUrl: string
  onBack: () => void
  onEdit: () => void
  onGenerateDriverLink: () => void
}) {
  const passengers = paidPassengers(bookings)
  return (
    <section className="w-full" aria-labelledby="transport-detail-title">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9500]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Transporte
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="transport-detail-title"
              className="break-words text-2xl font-bold tracking-tight text-white"
            >
              {transport.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/45">
              <span className="tabular-nums">
                {money(transport.price)} por persona
              </span>
              <span className="tabular-nums">
                {passengers} {passengers === 1 ? "pasaje" : "pasajes"}
              </span>
              <span
                className={
                  transport.isActive ? "text-emerald-300/80" : "text-white/40"
                }
              >
                {transport.isActive ? "En venta" : "Fuera de venta"}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            className={outlineButtonClass}
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Editar
          </Button>
        </div>
      </header>

      <div className="mt-7 max-w-3xl">
        <DetailBlock
          title="Salida"
          description="Punto de encuentro y condiciones de venta."
        >
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-white/45">Dirección</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-white">
                {transport.address}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-white/45">Precio por persona</dt>
              <dd className="mt-1 text-[14px] tabular-nums text-white">
                {money(transport.price)}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-white/45">Pasajes pagados</dt>
              <dd className="mt-1 text-[14px] tabular-nums text-white">
                {passengers}
              </dd>
            </div>
          </dl>
        </DetailBlock>

        <DetailBlock
          title="Lista del chofer"
          description="Compartí la lista de pasajeros de esta salida con quien maneja."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={driverBusy}
              onClick={onGenerateDriverLink}
              className={primaryButtonClass}
            >
              {driverBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <LinkIcon className="mr-1.5 h-4 w-4" />
              )}
              {driverUrl ? "Gestionar link" : "Generar link"}
            </Button>
            {driverUrl ? (
              <span className="text-[12px] text-emerald-300/80">
                Link activo
              </span>
            ) : null}
          </div>
        </DetailBlock>

        <DetailBlock
          title="Pasajeros"
          description="Compras con pago confirmado para esta salida."
        >
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={bookings.length === 0}
                onClick={() =>
                  downloadTransportPassengers(
                    bookings,
                    `pasajeros-${transport.id.slice(0, 8)}.csv`
                  )
                }
                className="text-white/55 hover:bg-white/[0.06] hover:text-white"
              >
                <Download className="mr-1.5 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
            <PassengerTable
              bookings={bookings}
              emptyLabel="Todavía no hay pasajes pagados para esta salida."
              showTransport={false}
            />
          </div>
        </DetailBlock>
      </div>
    </section>
  )
}

function PassengerTable({
  bookings,
  emptyLabel,
  showTransport = true
}: {
  bookings: Booking[]
  emptyLabel: string
  showTransport?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.02]">
      <Table className="table-fixed md:table-auto">
        <TableHeader>
          <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
            <TableHead className={`w-[62%] pl-4 md:w-auto ${tableHeadClass}`}>
              Titular
            </TableHead>
            <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
              DNI
            </TableHead>
            <TableHead className={`hidden md:table-cell ${tableHeadClass}`}>
              Celular
            </TableHead>
            <TableHead className={`pr-4 text-right ${tableHeadClass}`}>
              Pasajes
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-white/[0.06]">
          {bookings.length === 0 ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell
                colSpan={4}
                className="py-10 text-center text-[14px] text-white/40"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="border-0 transition-colors hover:bg-white/[0.03]"
              >
                <TableCell className="py-3.5 pl-4">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span
                      className="truncate text-[15px] font-medium text-white"
                      title={booking.customerName}
                    >
                      {booking.customerName}
                    </span>
                    {showTransport ? (
                      <span className="hidden min-w-0 truncate text-[12px] text-white/35 sm:inline">
                        {booking.name}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden py-3.5 text-[13px] tabular-nums text-white/55 md:table-cell">
                  {booking.customerDni ?? "—"}
                </TableCell>
                <TableCell className="hidden py-3.5 text-[13px] tabular-nums text-white/55 md:table-cell">
                  {booking.customerPhone ?? "—"}
                </TableCell>
                <TableCell className="py-3.5 pr-4 text-right text-[14px] tabular-nums text-white/80">
                  {booking.quantity}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function DetailBlock({
  title,
  description,
  children
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
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-[13px] font-medium text-white/70">{label}</span>
      {children}
    </label>
  )
}
