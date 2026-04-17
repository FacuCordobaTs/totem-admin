import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronLeft,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  CircleDollarSign,
  Search,
  ScanLine,
  Loader2,
  Store,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"
import type { EventBarsResponse, EventSalesPageResponse } from "@/types/event-dashboard"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PosScannerModal } from "@/components/pos/PosScannerModal"
import { SaleDetailsDialog } from "@/components/pos/SaleDetailsDialog"
import { useEventStock } from "@/hooks/useEventStock"
import {
  productAvailabilityUnits,
  type RecipeLine,
} from "@/lib/product-availability"

interface CatalogProduct {
  id: string
  name: string
  price: number
  recipes: RecipeLine[]
}

interface CartItem {
  product: CatalogProduct
  quantity: number
}

type PosShift = {
  eventId: string
  barId: string
  eventName: string
  barName: string
}

type StaffShiftApi = {
  shift: PosShift | null
}

type BarCatalogRowApi = {
  id: string
  name: string
  price: string
  isActiveForBar: boolean
  recipes: RecipeLine[]
}

type UiPayment = "cash" | "card" | "mercadopago"

function mapPayment(m: UiPayment): "CASH" | "CARD" | "MERCADOPAGO" {
  if (m === "cash") return "CASH"
  if (m === "card") return "CARD"
  return "MERCADOPAGO"
}

function formatPaymentLabel(
  p: EventSalesPageResponse["sales"][number]["paymentMethod"]
): string {
  switch (p) {
    case "CASH":
      return "Efectivo"
    case "CARD":
      return "Tarjeta"
    case "MERCADOPAGO":
      return "Mercado Pago"
    case "TRANSFER":
      return "Transferencia"
    default:
      return String(p)
  }
}

function formatSaleTime(createdAt: Date | string | null): string {
  if (createdAt == null) return "—"
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

type StockVisual = "unlimited" | "ok" | "low" | "out"

function stockVisualForProduct(
  avail: number,
  baseline: number | undefined
): StockVisual {
  if (!Number.isFinite(avail)) return "unlimited"
  if (avail <= 0) return "out"
  const b = Math.max(baseline ?? avail, 1)
  if (avail < 10 || avail < 0.05 * b) return "low"
  if (avail >= 0.2 * b) return "ok"
  return "low"
}

const shell = "bg-[#F2F2F7] text-black dark:bg-black dark:text-white"

const selectTriggerClass =
  "h-12 rounded-xl border-zinc-200/50 bg-background px-4 text-[15px] font-medium dark:border-zinc-800/50"

const panelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50"

const searchInputClass =
  "h-12 rounded-xl border-zinc-200/50 bg-[#F2F2F7] py-0 pr-4 pl-10 text-[15px] placeholder:text-[#8E8E93] focus-visible:ring-1 focus-visible:ring-[#FF9500]/40 dark:border-zinc-800/50 dark:bg-black dark:placeholder:text-[#98989D]"

export function PosPage() {
  const token = useAuthStore((s) => s.token)
  const staffName = useAuthStore((s) => s.staff?.name)
  const role = useAuthStore((s) => s.staff?.role)
  const isBartender = role === "BARTENDER"

  const [shiftPhase, setShiftPhase] = useState<"idle" | "loading" | "ready">("idle")
  const [lockedShift, setLockedShift] = useState<PosShift | null>(null)

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [posBars, setPosBars] = useState<{ id: string; name: string }[]>([])
  const [posBarId, setPosBarId] = useState<string>("")

  const activeEventId =
    isBartender && lockedShift ? lockedShift.eventId : eventId
  const activeBarId =
    isBartender && lockedShift ? lockedShift.barId : posBarId

  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")

  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<UiPayment>("cash")
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)

  const [historySales, setHistorySales] = useState<EventSalesPageResponse["sales"]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNonce, setHistoryNonce] = useState(0)

  const [isOnline, setIsOnline] = useState(true)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setShiftPhase("idle")
      setLockedShift(null)
      return
    }
    if (!isBartender) {
      setShiftPhase("ready")
      setLockedShift(null)
      return
    }
    setShiftPhase("loading")
    setLockedShift(null)
    void apiFetch<StaffShiftApi>("/staff/me/shift", { method: "GET", token })
      .then((res) => {
        setLockedShift(res.shift)
      })
      .catch(() => {
        setLockedShift(null)
      })
      .finally(() => {
        setShiftPhase("ready")
      })
  }, [token, isBartender])

  useEffect(() => {
    if (!token || isBartender) {
      if (!token) setEvents([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const evRes = await apiFetch<{ events: ApiEvent[] }>("/events", {
          method: "GET",
          token,
        })
        if (cancelled) return
        const evs = evRes.events.filter((e) => e.isActive !== false)
        setEvents(evs)
        setEventId((prev) => {
          if (prev && evs.some((e) => e.id === prev)) return prev
          return evs[0]?.id ?? ""
        })
      } catch {
        if (!cancelled) setEvents([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, isBartender])

  useEffect(() => {
    if (!isBartender || !lockedShift) return
    setEventId(lockedShift.eventId)
    setPosBars([{ id: lockedShift.barId, name: lockedShift.barName }])
    setPosBarId(lockedShift.barId)
  }, [isBartender, lockedShift])

  useEffect(() => {
    if (!token) {
      setPosBars([])
      setPosBarId("")
      return
    }
    if (isBartender && lockedShift) {
      return
    }
    if (!eventId) {
      setPosBars([])
      setPosBarId("")
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
          method: "GET",
          token,
        })
        if (cancelled) return
        const active = res.bars
          .filter((b) => b.isActive !== false)
          .map((b) => ({ id: b.id, name: b.name }))
        setPosBars(active)
        setPosBarId((prev) => {
          if (prev && active.some((b) => b.id === prev)) return prev
          return active[0]?.id ?? ""
        })
      } catch {
        if (!cancelled) {
          setPosBars([])
          setPosBarId("")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, eventId, isBartender, lockedShift])

  useEffect(() => {
    if (!token || !activeEventId || !activeBarId) {
      setCatalogProducts([])
      setCatalogLoading(false)
      return
    }
    if (isBartender && shiftPhase !== "ready") {
      return
    }
    if (isBartender && !lockedShift) {
      setCatalogProducts([])
      setCatalogLoading(false)
      return
    }

    let cancelled = false
    setCatalogLoading(true)
    void (async () => {
      try {
        const res = await apiFetch<{ products: BarCatalogRowApi[] }>(
          `/bars/${activeBarId}/products?eventId=${encodeURIComponent(activeEventId)}`,
          { method: "GET", token }
        )
        if (cancelled) return
        const rows = res.products
          .filter((p) => p.isActiveForBar === true)
          .map((p) => ({
            id: p.id,
            name: p.name,
            price: Number.parseFloat(p.price),
            recipes: p.recipes ?? [],
          }))
        setCatalogProducts(rows)
      } catch {
        if (!cancelled) {
          setCatalogProducts([])
          toast.error("No se pudo cargar el catálogo de la barra")
        }
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, activeEventId, activeBarId, isBartender, shiftPhase, lockedShift])

  const bumpHistory = useCallback(() => {
    setHistoryNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!token || !activeEventId || !activeBarId) {
      setHistorySales([])
      setHistoryLoading(false)
      return
    }
    if (isBartender && shiftPhase !== "ready") return
    if (isBartender && !lockedShift) {
      setHistorySales([])
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    void (async () => {
      try {
        const res = await apiFetch<EventSalesPageResponse>(
          `/events/${activeEventId}/sales?barId=${encodeURIComponent(activeBarId)}&limit=15&offset=0`,
          { method: "GET", token }
        )
        if (!cancelled) setHistorySales(res.sales)
      } catch {
        if (!cancelled) {
          setHistorySales([])
          toast.error("No se pudo cargar el historial")
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, activeEventId, activeBarId, historyNonce, isBartender, shiftPhase, lockedShift])

  const posReady =
    !!token &&
    !!activeEventId &&
    !!activeBarId &&
    (!isBartender || (!!lockedShift && shiftPhase === "ready"))

  const { eventStock, barStock, connectionStatus, refreshSnapshot } =
    useEventStock(activeEventId || null, activeBarId || null, token, posReady)

  const [productBaselines, setProductBaselines] = useState<
    Record<string, number>
  >({})

  useEffect(() => {
    setProductBaselines({})
  }, [activeEventId, activeBarId])

  useEffect(() => {
    if (!posReady) return
    setProductBaselines((prev) => {
      let changed = false
      const next = { ...prev }
      for (const p of catalogProducts) {
        if (next[p.id] != null) continue
        const a = productAvailabilityUnits(
          p.recipes,
          eventStock,
          barStock,
          activeBarId
        )
        if (!Number.isFinite(a)) continue
        next[p.id] = Math.max(a, 1)
        changed = true
      }
      return changed ? next : prev
    })
  }, [catalogProducts, eventStock, barStock, activeBarId, posReady])

  const filteredCatalog = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return catalogProducts
    return catalogProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [catalogProducts, productSearch])

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  )

  const addToCart = useCallback(
    (product: CatalogProduct) => {
      setCart((prev) => {
        const avail = productAvailabilityUnits(
          product.recipes,
          eventStock,
          barStock,
          activeBarId
        )
        const existing = prev.find((item) => item.product.id === product.id)
        if (Number.isFinite(avail)) {
          const nextQty = existing ? existing.quantity + 1 : 1
          if (nextQty > avail) {
            toast.error("Stock insuficiente")
            return prev
          }
        }
        if (existing) {
          return prev.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        return [...prev, { product, quantity: 1 }]
      })
    },
    [eventStock, barStock, activeBarId]
  )

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      setCart((prev) => {
        const item = prev.find((i) => i.product.id === productId)
        if (!item) return prev
        if (delta > 0) {
          const avail = productAvailabilityUnits(
            item.product.recipes,
            eventStock,
            barStock,
            activeBarId
          )
          if (
            Number.isFinite(avail) &&
            item.quantity + delta > avail
          ) {
            toast.error("Stock insuficiente")
            return prev
          }
        }
        return prev
          .map((it) =>
            it.product.id === productId
              ? { ...it, quantity: Math.max(0, it.quantity + delta) }
              : it
          )
          .filter((it) => it.quantity > 0)
      })
    },
    [eventStock, barStock, activeBarId]
  )

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const handleCobrar = useCallback(async () => {
    if (!token || !activeEventId || !activeBarId || cart.length === 0) return
    setCheckoutSubmitting(true)
    try {
      await apiFetch<{ totalAmount: string }>("/inventory/sales", {
        method: "POST",
        token,
        body: JSON.stringify({
          eventId: activeEventId,
          barId: activeBarId,
          paymentMethod: mapPayment(paymentMethod),
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
          })),
        }),
      })
      toast.success("Venta registrada")
      clearCart()
      bumpHistory()
      void refreshSnapshot()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar la venta"
      )
    } finally {
      setCheckoutSubmitting(false)
    }
  }, [
    token,
    activeEventId,
    activeBarId,
    cart,
    paymentMethod,
    clearCart,
    bumpHistory,
    refreshSnapshot,
  ])

  const backHref = isBartender ? "/settings" : "/"

  if (isBartender && shiftPhase === "loading") {
    return (
      <div
        className={cn(
          "flex min-h-screen flex-col items-center justify-center px-6",
          shell
        )}
      >
        <Loader2 className="h-7 w-7 animate-spin text-[#FF9500]" />
        <p className="mt-5 text-[15px] text-[#8E8E93] dark:text-[#98989D]">
          Cargando turno…
        </p>
      </div>
    )
  }

  if (isBartender && shiftPhase === "ready" && !lockedShift) {
    return (
      <div className={cn("flex min-h-screen flex-col", shell)}>
        <header className="flex items-center justify-between border-b border-zinc-200/50 px-4 py-3 backdrop-blur-xl bg-white/70 dark:border-zinc-800/50 dark:bg-black/70 sm:px-6">
          <Link
            to={backHref}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <h1 className="text-[17px] font-bold tracking-tight text-foreground">
              Punto de venta
            </h1>
            <p className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
              {staffName ?? "Staff"}
            </p>
          </div>
          <span className="w-11" aria-hidden />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl bg-background p-10">
            <Store className="mx-auto h-8 w-8 text-[#8E8E93] dark:text-[#98989D]" />
            <p className="mt-6 text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
              Sin turno asignado. Consultá con el encargado.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const showSelectors = !isBartender
  const shiftLabel =
    isBartender && lockedShift
      ? `${lockedShift.eventName} — ${lockedShift.barName}`
      : null

  const canCharge = posReady && cart.length > 0 && !checkoutSubmitting

  return (
    <div
      className={cn(
        "flex h-[calc(100svh-1rem)] min-h-0 flex-col overflow-hidden sm:h-svh",
        shell
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200/50 px-3 py-3 backdrop-blur-xl bg-white/70 dark:border-zinc-800/50 dark:bg-black/70 sm:px-5">
        <Link
          to={backHref}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div className="min-w-0 flex-1 px-2 text-center">
          <h1 className="truncate text-[17px] font-bold tracking-tight text-foreground sm:text-lg">
            Punto de venta
          </h1>
          {shiftLabel ? (
            <p className="truncate text-[12px] text-[#8E8E93] dark:text-[#98989D]">
              {shiftLabel}
            </p>
          ) : (
            <p className="truncate text-[12px] text-[#8E8E93] dark:text-[#98989D]">
              {staffName ?? "Staff"}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!posReady}
            onClick={() => setScannerOpen(true)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl transition-opacity active:opacity-70",
              posReady
                ? "text-[#FF9500]"
                : "cursor-not-allowed text-[#C7C7CC] opacity-50 dark:text-[#48484A]"
            )}
            aria-label="Escanear"
          >
            <ScanLine className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsOnline(!isOnline)}
            className={cn(
              "flex h-11 max-w-[4.5rem] items-center justify-center rounded-xl px-2 text-[10px] font-medium leading-tight sm:max-w-none sm:text-[11px]",
              isOnline
                ? "text-[#8E8E93] dark:text-[#98989D]"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {isOnline ? "Online" : "Offline"}
          </button>
        </div>
      </header>

      <PosScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        barId={posReady ? activeBarId : null}
        token={token}
      />
      <SaleDetailsDialog
        saleId={selectedSaleId}
        token={token}
        onClose={() => setSelectedSaleId(null)}
      />

      {showSelectors ? (
        <div className="shrink-0 space-y-3 border-b border-zinc-200/50 bg-white/70 px-4 py-4 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/50 sm:flex sm:flex-wrap sm:gap-6 sm:px-6">
          <div className="min-w-[200px] flex-1">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Evento
            </label>
            <Select value={eventId} onValueChange={setEventId} disabled={!events.length}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Elegí evento" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="rounded-lg py-2.5">
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {eventId && posBars.length > 0 ? (
            <div className="min-w-[200px] flex-1">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
                Barra
              </label>
              <Select value={posBarId} onValueChange={setPosBarId}>
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder="Elegí barra" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                  {posBars.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="rounded-lg py-2.5">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isOnline && (
        <div className="shrink-0 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
          Modo sin conexión simulado — en producción sincronizar ventas al volver la red
        </div>
      )}

      {posReady && connectionStatus === "closed" && (
        <div className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Stock en vivo desconectado — actualizando cada 25s. Revisá límites antes de cobrar.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 lg:grid-cols-12 lg:gap-5 lg:p-5">
        {/* Catálogo */}
        <section className={cn(panelClass, "lg:col-span-5")}>
          <div className="shrink-0 border-b border-zinc-200/50 p-4 dark:border-zinc-800/50 md:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto…"
                className={searchInputClass}
                disabled={!posReady}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
            {!posReady ? (
              <p className="py-10 text-center text-base text-zinc-500 dark:text-zinc-400">
                {isBartender ? "Cargando…" : "Elegí evento y barra para vender"}
              </p>
            ) : catalogLoading ? (
              <p className="py-10 text-center text-base text-zinc-500 dark:text-zinc-400">
                Cargando catálogo…
              </p>
            ) : filteredCatalog.length === 0 ? (
              <p className="py-10 text-center text-base text-zinc-500 dark:text-zinc-400">
                {catalogProducts.length === 0
                  ? "No hay productos activos en esta barra."
                  : "Nada coincide con la búsqueda."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {filteredCatalog.map((product) => {
                  const avail = productAvailabilityUnits(
                    product.recipes,
                    eventStock,
                    barStock,
                    activeBarId
                  )
                  const baseline = productBaselines[product.id]
                  const vis = stockVisualForProduct(avail, baseline)
                  const disabled =
                    Number.isFinite(avail) && avail <= 0
                  const badge =
                    vis === "unlimited"
                      ? null
                      : `${Math.floor(avail)} disp.`
                  return (
                    <Card
                      key={product.id}
                      size="sm"
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-disabled={disabled}
                      onClick={() => {
                        if (!disabled) addToCart(product)
                      }}
                      onKeyDown={(e) => {
                        if (disabled) return
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          addToCart(product)
                        }
                      }}
                      className={cn(
                        "relative gap-3 rounded-2xl border py-4 shadow-none ring-0 transition-all duration-300 dark:bg-zinc-950/30",
                        disabled
                          ? "cursor-not-allowed border-zinc-100 opacity-45 grayscale dark:border-zinc-800"
                          : "cursor-pointer border-zinc-100 bg-zinc-50/50 hover:bg-zinc-100/80 active:scale-[0.98] dark:border-zinc-800 dark:hover:bg-zinc-800/50",
                        !disabled &&
                          vis === "ok" &&
                          "border-zinc-200 dark:border-zinc-700",
                        !disabled &&
                          vis === "low" &&
                          "border-amber-200 dark:border-amber-900/50"
                      )}
                    >
                      {badge ? (
                        <span
                          className={cn(
                            "absolute right-3 top-3 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider tabular-nums",
                            vis === "out" &&
                              "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
                            vis === "low" &&
                              "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
                            vis === "ok" &&
                              "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                      <CardHeader className="px-4 py-0 pr-16">
                        <CardTitle className="text-base font-bold leading-tight tracking-tight text-zinc-950 dark:text-white">
                          {product.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-0 pt-0">
                        <p
                          className={cn(
                            "text-lg font-black tabular-nums tracking-tight",
                            disabled
                              ? "text-zinc-400"
                              : "text-[#FF9500]"
                          )}
                        >
                          ${product.price.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Carrito */}
        <section className={cn(panelClass, "lg:col-span-4")}>
          <div className="shrink-0 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Orden
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tighter text-zinc-950 dark:text-white">
              Pedido actual
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {cart.length === 0 ? (
              <p className="py-12 text-center text-base text-zinc-500 dark:text-zinc-400">
                Tocá un producto para agregarlo
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {cart.map((item) => {
                  const avail = productAvailabilityUnits(
                    item.product.recipes,
                    eventStock,
                    barStock,
                    activeBarId
                  )
                  const stockGone =
                    Number.isFinite(avail) &&
                    (avail <= 0 || item.quantity > avail)
                  return (
                  <li
                    key={item.product.id}
                    className={cn(
                      "flex items-stretch gap-3 rounded-2xl border p-3 transition-all duration-300",
                      stockGone
                        ? "border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/30"
                        : "border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/40"
                    )}
                  >
                    <div className="min-w-0 flex-1 self-center">
                      <p className="truncate font-bold text-zinc-950 dark:text-white">
                        {item.product.name}
                      </p>
                      {stockGone ? (
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                          Agotado en evento
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        ${item.product.price.toFixed(2)} c/u ·{" "}
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          ${(item.product.price * item.quantity).toFixed(2)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Menos"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-background text-zinc-900 transition-all duration-300 hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className="w-9 text-center text-lg font-black tabular-nums text-zinc-950 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Más"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-background text-zinc-900 transition-all duration-300 hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Quitar"
                        onClick={() => removeFromCart(item.product.id)}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-700 transition-all duration-300 hover:bg-red-100 active:scale-[0.98] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div
            className={cn(
              "shrink-0 space-y-4 border-t border-zinc-100 bg-zinc-50/95 p-5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90",
              "max-lg:sticky max-lg:bottom-0 max-lg:z-20"
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Total
              </span>
              <span className="text-3xl font-black tabular-nums tracking-tighter text-zinc-950 dark:text-white">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Pago
              </p>
              <div className="flex flex-wrap gap-2 rounded-[28px] border border-zinc-100 bg-backgound p-2 dark:border-zinc-800 ">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-bold transition-all duration-300 active:scale-[0.98] sm:text-sm",
                    paymentMethod === "cash"
                      ? "bg-[#FF9500] text-white dark:bg-[#FF9500]"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      paymentMethod === "cash"
                        ? "bg-white/20"
                        : "bg-zinc-100 dark:bg-zinc-800"
                    )}
                  >
                    <Banknote
                      className={cn(
                        "h-5 w-5",
                        paymentMethod === "cash"
                          ? "text-white"
                          : "text-zinc-600 dark:text-zinc-300"
                      )}
                    />
                  </span>
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-bold transition-all duration-300 active:scale-[0.98] sm:text-sm",
                    paymentMethod === "card"
                      ? "bg-[#FF9500] text-white dark:bg-[#FF9500]"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      paymentMethod === "card"
                        ? "bg-white/20"
                        : "bg-zinc-100 dark:bg-zinc-800"
                    )}
                  >
                    <CreditCard
                      className={cn(
                        "h-5 w-5",
                        paymentMethod === "card"
                          ? "text-white"
                          : "text-zinc-600 dark:text-zinc-300"
                      )}
                    />
                  </span>
                  Tarjeta
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("mercadopago")}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-3 text-[0.65rem] font-bold leading-tight transition-all duration-300 active:scale-[0.98] sm:px-2 sm:text-xs",
                    paymentMethod === "mercadopago"
                      ? "bg-[#FF9500] text-white dark:bg-[#FF9500]"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      paymentMethod === "mercadopago"
                        ? "bg-white/20"
                        : "bg-zinc-100 dark:bg-zinc-800"
                    )}
                  >
                    <QrCode
                      className={cn(
                        "h-5 w-5 shrink-0",
                        paymentMethod === "mercadopago"
                          ? "text-white"
                          : "text-zinc-600 dark:text-zinc-300"
                      )}
                    />
                  </span>
                  Mercado Pago
                </button>
              </div>
            </div>

            <Button
              type="button"
              disabled={!canCharge}
              onClick={() => void handleCobrar()}
              className="h-14 w-full gap-2 rounded-2xl bg-[#FF9500] text-[17px] font-bold tracking-tight text-white transition-all duration-200 hover:bg-[#FF9500]/90 active:opacity-90 disabled:opacity-50"
            >
              {checkoutSubmitting ? (
                <span className="animate-pulse">Cobrando…</span>
              ) : (
                <>
                  <CircleDollarSign className="h-5 w-5 text-white" />
                  Cobrar ${cartTotal.toFixed(2)}
                </>
              )}
            </Button>
          </div>
        </section>

        {/* Historial */}
        <section className={cn(panelClass, "lg:col-span-3")}>
          <div className="shrink-0 border-b border-zinc-200/50 px-5 py-4 dark:border-zinc-800/50">
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">
              Historial
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {!posReady ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">—</p>
            ) : historyLoading ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Cargando…
              </p>
            ) : historySales.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Aún no hay ventas en esta barra.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {historySales.map((sale) => (
                  <li key={sale.id} className="list-none">
                    <button
                      type="button"
                      onClick={() => setSelectedSaleId(sale.id)}
                      className={cn(
                        "w-full rounded-xl border border-zinc-200/50 bg-[#F2F2F7]/80 px-4 py-3.5 text-left transition-colors dark:border-zinc-800/50 dark:bg-black/20",
                        "hover:bg-white active:opacity-90 dark:hover:bg-zinc-800/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatSaleTime(sale.createdAt)}
                        </span>
                        <span className="text-base font-black tabular-nums text-zinc-950 dark:text-white">
                          ${Number.parseFloat(sale.totalAmount).toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {formatPaymentLabel(sale.paymentMethod)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
