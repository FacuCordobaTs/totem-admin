import { useState } from "react"
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

interface Product {
  id: string
  name: string
  price: number
  icon: ElementType
}

interface CartItem {
  product: Product
  quantity: number
}

const products: Product[] = [
  { id: "1", name: "Fernet", price: 12.00, icon: Wine },
  { id: "2", name: "Gin tonic", price: 10.00, icon: Martini },
  { id: "3", name: "Vodka RB", price: 14.00, icon: Coffee },
  { id: "4", name: "Cerveza", price: 6.00, icon: Beer },
  { id: "5", name: "Whisky", price: 11.00, icon: Wine },
  { id: "6", name: "Agua", price: 3.00, icon: Droplets },
]

type PaymentMethod = "cash" | "card" | "qr" | null
type CheckoutState = "selecting" | "processing" | "complete"

export function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("selecting")

  const addToCart = (product: Product) => {
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

  const handlePayment = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setCheckoutState("processing")

    setTimeout(() => {
      setCheckoutState("complete")

      setTimeout(() => {
        setShowPayment(false)
        setPaymentMethod(null)
        setCheckoutState("selecting")
        clearCart()
      }, 1500)
    }, 1000)
  }

  const paymentLabel =
    paymentMethod === "cash"
      ? "efectivo"
      : paymentMethod === "card"
      ? "tarjeta"
      : "QR"

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
          <h1 className="text-sm font-medium">Bar n.º 2 — Planta principal</h1>
          <p className="text-xs text-muted-foreground">Álex Martínez</p>
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

      {!isOnline && (
        <div className="bg-destructive/20 px-4 py-2 text-center text-xs text-destructive">
          Modo sin conexión: las ventas se sincronizarán al recuperar la red
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
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
                {cartItem && (
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {cartItem.quantity}
                  </span>
                )}
                <Icon className="h-8 w-8 text-foreground" />
                <span className="mt-2 text-sm font-medium">{product.name}</span>
                <span className="mt-1 text-sm text-muted-foreground">
                  ${product.price.toFixed(2)}
                </span>
              </button>
            )
          })}
        </div>
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
            onClick={() => setShowPayment(true)}
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
              {checkoutState === "complete" ? "Pago completado" : "Método de pago"}
            </DialogTitle>
          </DialogHeader>

          {checkoutState === "selecting" && (
            <div className="flex flex-col gap-3 py-4">
              <div className="mb-2 text-center">
                <span className="text-3xl font-bold">${total.toFixed(2)}</span>
              </div>

              <Button
                onClick={() => handlePayment("cash")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <Banknote className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">Efectivo</span>
              </Button>

              <Button
                onClick={() => handlePayment("card")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <CreditCard className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">Tarjeta</span>
              </Button>

              <Button
                onClick={() => handlePayment("qr")}
                variant="outline"
                className="h-14 justify-start gap-3 text-left"
              >
                <QrCode className="h-6 w-6 text-primary" />
                <span className="text-base font-medium">QR del cliente (app)</span>
              </Button>
            </div>
          )}

          {checkoutState === "processing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-muted-foreground">Procesando pago...</p>
            </div>
          )}

          {checkoutState === "complete" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Pago correcto</p>
                <p className="text-sm text-muted-foreground">
                  ${total.toFixed(2)} — {paymentLabel}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
