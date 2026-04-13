import { useCallback, useEffect, useState } from "react"
import type { ElementType } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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
  Cloud,
  CloudOff,
  ChevronLeft,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle,
  Wine,
  Beer,
  Coffee,
  Droplets,
  Martini,
  CircleDollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"

const ICONS: ElementType[] = [Wine, Martini, Coffee, Beer, Droplets, Wine]

interface PosProduct {
  id: string
  name: string
  price: number
  icon: ElementType
}

interface CartItem {
  product: PosProduct
  quantity: number
}

type PaymentMethod = "cash" | "card" | "qr" | null
type CheckoutState = "selecting" | "processing" | "complete" | "error"

type ProductsApi = {
  products: { id: string; name: string; price: string; isActive: boolean | null }[]
}

export function PosPage() {
  const token = useAuthStore((s) => s.token)
  const staffName = useAuthStore((s) => s.staff?.name)

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [products, setProducts] = useState<PosProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  const [cart, setCart] = useState<CartItem[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("selecting")
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [lastTotal, setLastTotal] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    if (!token) {
      setEvents([])
      setProducts([])
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(true)
    try {
      const [evRes, prodRes] = await Promise.all([
        apiFetch<{ events: ApiEvent[] }>("/events", { method: "GET", token }),
        apiFetch<ProductsApi>("/inventory/products", { method: "GET", token }),
      ])
      const evs = evRes.events.filter((e) => e.isActive !== false)
      setEvents(evs)
      setEventId((prev) => {
        if (prev && evs.some((e) => e.id === prev)) return prev
        return evs[0]?.id ?? ""
      })
      const posProducts: PosProduct[] = prodRes.products
        .filter((p) => p.isActive !== false)
        .map((p, i) => ({
          id: p.id,
          name: p.name,
          price: Number.parseFloat(p.price),
          icon: ICONS[i % ICONS.length]!,
        }))
      setProducts(posProducts)
    } catch {
      setEvents([])
      setProducts([])
    } finally {
      setCatalogLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const addToCart = (product: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const clearCart = () => setCart([])

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

  const mapPayment = (m: PaymentMethod): "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER" => {
    if (m === "cash") return "CASH"
    if (m === "card") return "CARD"
    return "MERCADOPAGO"
  }

  const handlePayment = async (method: PaymentMethod) => {
    if (!token || !eventId || !method) return
    setPaymentMethod(method)
    setCheckoutState("processing")
    setCheckoutError(null)
    try {
      const res = await apiFetch<{ totalAmount: string }>("/inventory/sales", {
        method: "POST",
        token,
        body: JSON.stringify({
          eventId,
          paymentMethod: mapPayment(method),
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
          })),
        }),
      })
      setLastTotal(res.totalAmount)
      setCheckoutState("complete")
      clearCart()
      window.setTimeout(() => {
        setShowPayment(false)
        setPaymentMethod(null)
        setCheckoutState("selecting")
        setLastTotal(null)
      }, 1800)
    } catch (err) {
      setCheckoutState("error")
      setCheckoutError(
        err instanceof ApiError ? err.message : "No se pudo registrar la venta"
      )
    }
  }

  const paymentLabel =
    paymentMethod === "cash"
      ? "efectivo"
      : paymentMethod === "card"
        ? "tarjeta"
        : "QR / MP"

  const displayTotal =
    checkoutState === "complete" && lastTotal
      ? Number.parseFloat(lastTotal)
      : total

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <div className="text-center">
          <h1 className="text-sm font-medium">Punto de venta</h1>
          <p className="text-xs text-muted-foreground">{staffName ?? "Staff"}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsOnline(!isOnline)}
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors",
            isOnline
              ? "bg-primary/20 text-primary"
              : "bg-destructive/20 text-destructive"
          )}
        >
          {isOnline ? (
            <>
              <Cloud className="h-3 w-3" />
              En línea
            </>
          ) : (
            <>
              <CloudOff className="h-3 w-3" />
              Sin conexión
            </>
          )}
        </button>
      </header>

      <div className="border-b border-border bg-secondary/20 px-4 py-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Evento (ventas y stock)
        </label>
        <Select value={eventId} onValueChange={setEventId} disabled={!events.length}>
          <SelectTrigger className="bg-secondary">
            <SelectValue placeholder="Elegí evento" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isOnline && (
        <div className="bg-destructive/20 px-4 py-2 text-center text-xs text-destructive">
          Modo sin conexión simulado — en producción sincronizar ventas al volver la red
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {catalogLoading ? (
          <p className="text-center text-sm text-muted-foreground">Cargando catálogo…</p>
        ) : !eventId ? (
          <p className="text-center text-sm text-muted-foreground">
            Creá un evento activo para usar el POS
          </p>
        ) : products.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No hay productos activos. Configuralos en Inventario PRO.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((product) => {
              const Icon = product.icon
              const cartItem = cart.find((item) => item.product.id === product.id)

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all active:scale-95",
                    cartItem
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/30 hover:bg-secondary/50"
                  )}
                >
                  {cartItem ? (
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {cartItem.quantity}
                    </span>
                  ) : null}
                  <Icon className="h-8 w-8 text-foreground" />
                  <span className="mt-2 text-sm font-medium">{product.name}</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    ${product.price.toFixed(2)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} ítems
            </span>
            <button
              type="button"
              onClick={clearCart}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              Vaciar
            </button>
          </div>

          <div className="mb-3 flex flex-col gap-2">
            {cart.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
              >
                <span className="text-sm font-medium">{item.product.name}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-secondary/80"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-secondary/80"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm font-medium">
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              setCheckoutState("selecting")
              setCheckoutError(null)
              setShowPayment(true)
            }}
            disabled={!eventId || !token}
            className="h-14 w-full bg-primary text-lg font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <CircleDollarSign className="mr-2 h-5 w-5" />
            Cobrar ${total.toFixed(2)}
          </Button>
        </div>
      )}

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-center">
              {checkoutState === "complete"
                ? "Pago completado"
                : checkoutState === "error"
                  ? "No se pudo cobrar"
                  : "Método de pago"}
            </DialogTitle>
          </DialogHeader>

          {checkoutState === "selecting" && (
            <div className="flex flex-col gap-3 py-4">
              <div className="mb-2 text-center">
                <span className="text-3xl font-bold">${total.toFixed(2)}</span>
              </div>

              <Button
                onClick={() => void handlePayment("cash")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <Banknote className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">Efectivo</span>
              </Button>

              <Button
                onClick={() => void handlePayment("card")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <CreditCard className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">Tarjeta</span>
              </Button>

              <Button
                onClick={() => void handlePayment("qr")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <QrCode className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">QR / Mercado Pago</span>
              </Button>
            </div>
          )}

          {checkoutState === "processing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-muted-foreground">Registrando venta…</p>
            </div>
          )}

          {checkoutState === "complete" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Venta registrada</p>
                <p className="text-sm text-muted-foreground">
                  ${displayTotal.toFixed(2)} — {paymentLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stock actualizado según recetas
                </p>
              </div>
            </div>
          )}

          {checkoutState === "error" && (
            <div className="flex flex-col gap-4 py-4">
              <p className="text-center text-sm text-destructive">{checkoutError}</p>
              <Button
                onClick={() => {
                  setCheckoutState("selecting")
                  setCheckoutError(null)
                }}
              >
                Volver
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
