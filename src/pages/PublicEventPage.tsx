import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router"
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
import { publicApiFetch, ApiError } from "@/lib/api"
import { Calendar, MapPin, Sparkles } from "lucide-react"

type PublicTicketType = {
  id: string
  name: string
  price: string
  stockLimit: number | null
  sold: number
  remaining: number | null
  availableForPurchase: boolean
}

type PublicEventPayload = {
  productora: { name: string }
  event: {
    id: string
    name: string
    date: string
    location: string | null
  }
  ticketTypes: PublicTicketType[]
}

type PurchaseResponse = {
  message: string
  ticket: {
    id: string
    qrHash: string
    status: string
    buyerName: string | null
    buyerEmail: string | null
    ticketTypeName: string
  }
  qrDataUrl: string
}

type PurchaseSuccess = PurchaseResponse & { productoraName: string }

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PublicEventPage() {
  const { id: eventId } = useParams<{ id: string }>()

  const [payload, setPayload] = useState<PublicEventPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<PublicTicketType | null>(null)
  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const [success, setSuccess] = useState<PurchaseSuccess | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return
    setLoadError(null)
    setLoading(true)
    try {
      const data = await publicApiFetch<PublicEventPayload>(
        `/public/events/${eventId}`,
        { method: "GET" }
      )
      setPayload(data)
    } catch (err) {
      setPayload(null)
      setLoadError(
        err instanceof ApiError ? err.message : "No se pudo cargar el evento"
      )
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  function openCheckout(tt: PublicTicketType) {
    if (!tt.availableForPurchase) return
    setSelectedType(tt)
    setBuyerName("")
    setBuyerEmail("")
    setPurchaseError(null)
    setCheckoutOpen(true)
  }

  async function submitPurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !selectedType || !payload) return
    setPurchaseError(null)
    setPurchaseLoading(true)
    try {
      const data = await publicApiFetch<PurchaseResponse>("/public/tickets/purchase", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          ticketTypeId: selectedType.id,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
        }),
      })
      setCheckoutOpen(false)
      setSuccess({
        ...data,
        productoraName: payload.productora.name,
      })
      await load()
    } catch (err) {
      setPurchaseError(
        err instanceof ApiError ? err.message : "No se pudo completar la compra"
      )
    } finally {
      setPurchaseLoading(false)
    }
  }

  function resetFlow() {
    setSuccess(null)
    setSelectedType(null)
  }

  if (!eventId) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-950 px-4 text-neutral-200">
        <p>Enlace inválido</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-svh bg-gradient-to-b from-neutral-950 via-neutral-900 to-black px-4 py-12 text-neutral-50">
               <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/95">
            Entradas de {success.productoraName}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            ¡Compra exitosa!
          </h1>
          <p className="mt-3 text-sm text-neutral-400">
            Guardá o capturá este código. Lo pedirán en el acceso al evento. Tu compra quedó
            registrada con {success.productoraName}.
          </p>
          <p className="mt-2 text-sm font-medium text-neutral-200">
            {success.ticket.ticketTypeName}
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white p-4 shadow-2xl shadow-black/50">
            <img
              src={success.qrDataUrl}
              alt="Código QR de tu entrada"
              className="h-64 w-64 max-w-full object-contain md:h-72 md:w-72"
              width={288}
              height={288}
            />
          </div>
          <p className="mt-6 max-w-full break-all font-mono text-xs text-neutral-500">
            {success.ticket.qrHash}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-10 border-white/20 bg-white/5 text-neutral-100 hover:bg-white/10"
            onClick={resetFlow}
          >
            Volver al evento
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-neutral-950 via-neutral-900 to-black text-neutral-50">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/95">
            Totem
          </span>
          <span className="text-xs text-neutral-500">Venta de entradas</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {loading ? (
          <p className="text-center text-neutral-400">Cargando evento…</p>
        ) : loadError || !payload ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-neutral-300">{loadError ?? "Evento no disponible"}</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-400/95">
                Entradas de {payload.productora.name}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                {payload.event.name}
              </h1>
              <div className="mt-4 flex flex-col items-center gap-2 text-sm text-neutral-400 md:flex-row md:justify-center md:gap-6">
                <span className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-400/80" />
                  {formatDate(payload.event.date)}
                </span>
                {payload.event.location ? (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-amber-400/80" />
                    {payload.event.location}
                  </span>
                ) : null}
              </div>
              <p className="mx-auto mt-6 max-w-xl text-sm text-neutral-500">
                Comprá tu entrada de forma segura. Cada venta queda asociada a{" "}
                <span className="font-medium text-neutral-400">{payload.productora.name}</span>.
              </p>
            </div>

            <div className="mt-12 space-y-4">
              <h2 className="text-lg font-medium text-neutral-200">
                Tipos de entrada · {payload.productora.name}
              </h2>
              <ul className="flex flex-col gap-3">
                {payload.ticketTypes.map((tt) => (
                  <li
                    key={tt.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-neutral-100">{tt.name}</p>
                      <p className="mt-1 text-lg font-semibold text-amber-400/95">
                        ${Number(tt.price).toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {tt.stockLimit == null
                          ? `${tt.sold} vendidas · cupos amplios`
                          : tt.remaining === 0
                            ? "Agotado"
                            : `${tt.remaining} disponibles`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      disabled={!tt.availableForPurchase}
                      className="h-12 min-w-[140px] shrink-0 bg-amber-500 font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
                      onClick={() => openCheckout(tt)}
                    >
                      {tt.availableForPurchase ? "Comprar" : "Agotado"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-14 text-center text-xs text-neutral-600">
              Totem · experiencia pensada para productoras y eventos de alto volumen
            </p>
          </>
        )}
      </main>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="border-white/10 bg-neutral-900 text-neutral-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Finalizar compra</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Pago simulado — no se cobrará con tarjeta. Completá tus datos para emitir la entrada.
              {selectedType ? (
                <>
                  {" "}
                  <span className="font-medium text-neutral-300">{selectedType.name}</span> · $
                  {selectedType ? Number(selectedType.price).toFixed(2) : ""}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPurchase} className="flex flex-col gap-4">
            {purchaseError ? (
              <p className="text-sm text-red-400" role="alert">
                {purchaseError}
              </p>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="pub-name" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="pub-name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                required
                autoComplete="name"
                className="h-11 border-white/15 bg-white/5 text-base text-neutral-100"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pub-email" className="text-sm font-medium">
                Correo
              </label>
              <Input
                id="pub-email"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 border-white/15 bg-white/5 text-base text-neutral-100"
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-transparent"
                onClick={() => setCheckoutOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={purchaseLoading}
                className="bg-amber-500 font-semibold text-neutral-950 hover:bg-amber-400"
              >
                {purchaseLoading ? "Procesando…" : "Confirmar compra"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
