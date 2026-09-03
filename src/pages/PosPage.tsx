import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"
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
  RefreshCw,
  Wallet,
  X,
  AlertTriangle,
  Package,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { usePosSessionStore } from "@/stores/pos-session-store"
import type { ApiEvent } from "@/types/events"
import type { EventBarsResponse, EventSalesPageResponse } from "@/types/event-dashboard"
import type { ApiPromoter } from "@/components/events/promoters-panel"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PosScannerModal } from "@/components/pos/PosScannerModal"
import { SaleDetailsDialog } from "@/components/pos/SaleDetailsDialog"
import { useEventStock } from "@/hooks/useEventStock"
import type { RecipeLine } from "@/lib/product-availability"
import { usePrinter } from "@/context/PrinterContext"
import {
  commandsToBytes,
  formatReciboVentaBarra,
  formatTicketCanjeable,
} from "@/lib/printerUtils"

interface CatalogProduct {
  id: string
  name: string
  price: number
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number | null
  recipes: RecipeLine[]
  /** Productos sin receta: null significa que no tienen límite de unidades. */
  directStock: string | null
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

// Tarea 5.2 — Respuesta de POST /inventory/sales: el backend devuelve el token del recibo
// y los QRs canjeables (uno por consumición) para imprimir el ticket en caja.
type SaleChargeResponse = {
  message: string
  saleId: string
  receiptToken?: string
  totalAmount: string
  customerId?: string | null
  consumptions?: { productName: string; qrHash: string }[]
  /** Tarea 6.3 — Saldo resultante tras cobrar contra saldo (solo `paymentMethod === "SALDO"`). */
  balance?: string
}

// Tarea 6.3 — Consulta de saldo por DNI en la caja (GET /events/:id/balance).
type BalanceLookupResponse = {
  amount: string
  customer: { id: string; name: string } | null
}

type BarCatalogRowApi = {
  id: string
  name: string
  price: string
  isActiveForBar: boolean
  categoryId?: string | null
  categoryName?: string | null
  categorySortOrder?: number | null
  recipes: RecipeLine[]
  directStock?: string | null
}

type UiPayment = "cash" | "card" | "mercadopago" | "saldo"

function mapPayment(m: UiPayment): "CASH" | "CARD" | "MERCADOPAGO" | "SALDO" {
  if (m === "cash") return "CASH"
  if (m === "card") return "CARD"
  if (m === "saldo") return "SALDO"
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
    case "SALDO":
      return "Saldo"
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

/**
 * La caja vende contra el inventario general del evento. La barra identifica quién
 * cobró, pero no limita qué producto se puede cobrar ni su disponibilidad.
 */
function eventProductAvailabilityUnits(
  product: CatalogProduct,
  eventStock: Record<string, number>
): number {
  if (product.recipes.length === 0) {
    if (product.directStock == null) return Number.POSITIVE_INFINITY
    const directStock = Number.parseFloat(product.directStock)
    return Number.isFinite(directStock) ? Math.max(0, Math.floor(directStock)) : 0
  }

  let available = Number.POSITIVE_INFINITY
  for (const recipe of product.recipes) {
    const quantity = Number.parseFloat(recipe.quantityUsed)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const stock = eventStock[recipe.inventoryItemId] ?? 0
    available = Math.min(available, Math.floor(stock / quantity))
  }
  return Number.isFinite(available) ? Math.max(0, available) : 0
}

const shell = "bg-[#F2F2F7] text-black dark:bg-black dark:text-white"

const selectTriggerClass =
  "h-12 rounded-xl border-zinc-200/50 bg-background px-4 text-[15px] font-medium dark:border-zinc-800/50"

const panelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/50 bg-background dark:border-zinc-800/50"

const searchInputClass =
  "h-12 rounded-xl border-zinc-200/50 bg-[#F2F2F7] py-0 pr-4 pl-10 text-[15px] placeholder:text-[#8E8E93] focus-visible:ring-1 focus-visible:ring-[#FF9500]/40 dark:border-zinc-800/50 dark:bg-black dark:placeholder:text-[#98989D]"

export function PosPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const staffName = useAuthStore((s) => s.staff?.name)
  const role = useAuthStore((s) => s.staff?.role)
  const logout = useAuthStore((s) => s.logout)
  const isBartender = role === "BARTENDER"

  // Sesión de puesto: si este dispositivo está fijado a un puesto, el turno viene
  // del puesto (no de /me/shift) y vale para cualquier rol que entre por PIN.
  const posSession = usePosSessionStore((s) => s.session)
  const deviceShift: PosShift | null =
    posSession && posSession.barId
      ? {
          eventId: posSession.eventId,
          barId: posSession.barId,
          eventName: posSession.eventName,
          barName: posSession.barName ?? "",
        }
      : null

  const [shiftPhase, setShiftPhase] = useState<"idle" | "loading" | "ready">("idle")
  const [lockedShift, setLockedShift] = useState<PosShift | null>(null)

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [posBars, setPosBars] = useState<{ id: string; name: string }[]>([])
  const [posBarId, setPosBarId] = useState<string>("")

  // El turno "atado" al dispositivo: el puesto (si está fijado) manda; si no, el
  // turno del bartender. Un dispositivo de puesto no muestra selectores de evento/barra.
  const hasDeviceShift = !!deviceShift
  const boundShift = deviceShift ?? (isBartender ? lockedShift : null)
  const hasBoundShift = !!boundShift
  const shiftBound = hasDeviceShift || isBartender
  // El puesto ya trae su turno resuelto; solo el bartender sin puesto espera a /me/shift.
  const shiftResolving = isBartender && !deviceShift && shiftPhase !== "ready"

  const activeEventId = boundShift ? boundShift.eventId : eventId
  const activeBarId = boundShift ? boundShift.barId : posBarId

  // Para el ticket impreso del pedido entregado (4.3) y futuros tickets de caja.
  const posEventName =
    boundShift?.eventName ?? events.find((e) => e.id === activeEventId)?.name ?? null
  const posBarName =
    boundShift?.barName ?? posBars.find((b) => b.id === activeBarId)?.name ?? null

  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [eventStockOpen, setEventStockOpen] = useState(false)

  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<UiPayment>("cash")
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)

  // Tarea 5.1 — Venta en caja: DNI y nombre del cliente (opcionales). Con DNI la venta queda
  // registrada a nombre de la persona (identidad del evento, visión §2.0) y habilita la F6 (saldo).
  const [customerDni, setCustomerDni] = useState("")
  const [customerName, setCustomerName] = useState("")

  // Tarea 9.1 — Promotor de la venta (opcional): se atribuye la venta a un promotor
  // (visión §2.8). Vacío = venta sin promotor.
  const [promoters, setPromoters] = useState<ApiPromoter[]>([])
  const [promoterId, setPromoterId] = useState("")

  // Tarea 6.3 — Saldo del cliente en caja (visión §2.7: "da el DNI y le dan el ticket").
  // Se consulta con debounce mientras se tipea el DNI; `null` = sin dato (o DNI inválido).
  const [customerBalance, setCustomerBalance] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [knownCustomerName, setKnownCustomerName] = useState<string | null>(null)

  // Tarea 6.3 — Carga de saldo en la caja física (efectivo/tarjeta): acredita `customer_balances`
  // del DNI con el movimiento CAJA (la venta POS queda en el historial y entra al cierre F10).
  const [chargeOpen, setChargeOpen] = useState(false)
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargeMethod, setChargeMethod] = useState<"CASH" | "CARD">("CASH")
  const [chargeSubmitting, setChargeSubmitting] = useState(false)

  const [historySales, setHistorySales] = useState<EventSalesPageResponse["sales"]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNonce, setHistoryNonce] = useState(0)

  const [isOnline, setIsOnline] = useState(true)
  const isScannerRoute = location.pathname === "/pos/escaner"
  const [scannerOpen, setScannerOpen] = useState(isScannerRoute)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  useEffect(() => {
    if (isScannerRoute) setScannerOpen(true)
  }, [isScannerRoute])

  const handleScannerOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isScannerRoute) {
        // El escáner es un módulo separado en móvil: al cerrarlo se vuelve al
        // selector, no a la caja que quedó detrás.
        navigate("/pos", { replace: true })
        return
      }
      setScannerOpen(open)
    },
    [isScannerRoute, navigate]
  )

  // Tarea 5.2 — Impresión conectada: tras cobrar se imprime el recibo (y, en modo caja
  // con DNI, el ticket canjeable con los QRs de las consumiciones).
  const { printers, selectedPrinter, setSelectedPrinter, refreshPrinters, printRaw } =
    usePrinter()

  const printSaleDocuments = useCallback(
    async (res: SaleChargeResponse) => {
      const printDoc = async (label: string, build: () => number[]) => {
        try {
          await printRaw(commandsToBytes(build()))
        } catch (err) {
          // La venta ya está registrada; la impresión fallida no la revierte.
          toast.error(
            `${label}: ${err instanceof Error ? err.message : "no se pudo imprimir"}`
          )
        }
      }

      await printDoc("Recibo", () =>
        formatReciboVentaBarra(
          {
            id: res.saleId,
            receiptToken: res.receiptToken ?? null,
            totalAmount: res.totalAmount,
            paymentMethod: mapPayment(paymentMethod),
            staffName,
            customerName:
              customerDni.trim() !== "" ? customerName.trim() || "Cliente" : null,
            createdAt: new Date(),
          },
          cart.map((c) => ({
            name: c.product.name,
            quantity: c.quantity,
            priceAtTime: c.product.price,
          })),
          posBarName ?? "—",
          posEventName ?? "Evento"
        )
      )

      // Modo caja con DNI: además imprime el ticket canjeable con un QR por consumición.
      // Sin DNI es una venta de barra directa: la bebida se entrega en el momento.
      const consumptions = res.consumptions
      if (
        customerDni.trim() !== "" &&
        consumptions &&
        consumptions.length > 0
      ) {
        await printDoc("Ticket", () =>
          formatTicketCanjeable(
            consumptions,
            posEventName ?? "Evento",
            posBarName ?? "—",
            customerName.trim() || null
          )
        )
      }
    },
    [
      printRaw,
      paymentMethod,
      staffName,
      customerDni,
      customerName,
      cart,
      posBarName,
      posEventName,
    ]
  )

  useEffect(() => {
    if (!token) {
      setShiftPhase("idle")
      setLockedShift(null)
      return
    }
    if (!isBartender || hasDeviceShift) {
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
  }, [token, isBartender, hasDeviceShift])

  useEffect(() => {
    if (!token || isBartender || hasDeviceShift) {
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
        // Tarea 11.3 — `isActive` retirado del modelo: el POS ofrece eventos no cerrados.
        const evs = evRes.events.filter((e) => e.status !== "closed")
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
  }, [token, isBartender, hasDeviceShift])

  // Tarea 9.1 — Promotores activos para atribuir la venta (no bloquea: sin red, la venta
  // se cobra igual sin promotor).
  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<{ promoters: ApiPromoter[] }>("/promoters", {
          method: "GET",
          token,
        })
        if (!cancelled) setPromoters(res.promoters.filter((p) => p.isActive))
      } catch {
        if (!cancelled) setPromoters([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!boundShift) return
    setEventId(boundShift.eventId)
    setPosBars([{ id: boundShift.barId, name: boundShift.barName }])
    setPosBarId(boundShift.barId)
  }, [boundShift?.eventId, boundShift?.barId, boundShift?.barName])

  useEffect(() => {
    if (!token) {
      setPosBars([])
      setPosBarId("")
      return
    }
    if (boundShift) {
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
  }, [token, eventId, hasDeviceShift, isBartender, lockedShift])

  useEffect(() => {
    if (!token || !activeEventId || !activeBarId) {
      setCatalogProducts([])
      setCatalogLoading(false)
      return
    }
    if (shiftResolving) {
      return
    }
    if (shiftBound && !hasBoundShift) {
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
        // La caja comparte el menú del evento: la asignación a una barra no
        // debe esconder productos ni impedir una venta.
        const rows = res.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number.parseFloat(p.price),
            categoryId: p.categoryId ?? null,
            categoryName: p.categoryName ?? null,
            categorySortOrder: p.categorySortOrder ?? null,
            recipes: p.recipes ?? [],
            directStock: p.directStock ?? null,
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
  }, [token, activeEventId, activeBarId, shiftResolving, shiftBound, hasBoundShift])

  const bumpHistory = useCallback(() => {
    setHistoryNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!token || !activeEventId || !activeBarId) {
      setHistorySales([])
      setHistoryLoading(false)
      return
    }
    if (shiftResolving) return
    if (shiftBound && !hasBoundShift) {
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
  }, [token, activeEventId, activeBarId, historyNonce, shiftResolving, shiftBound, hasBoundShift])

  // Tarea 6.3 — Al tipear un DNI válido (≥6 dígitos), consulta el saldo del cliente en el
  // evento (y su nombre registrado, si la persona ya compró/cargó alguna vez).
  useEffect(() => {
    const dni = customerDni.trim()
    if (!token || !activeEventId || dni.length < 6) {
      setCustomerBalance(null)
      setKnownCustomerName(null)
      setBalanceLoading(false)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    const t = setTimeout(() => {
      apiFetch<BalanceLookupResponse>(
        `/events/${activeEventId}/balance?dni=${encodeURIComponent(dni)}`,
        { method: "GET", token }
      )
        .then((res) => {
          if (cancelled) return
          setCustomerBalance(res.amount)
          setKnownCustomerName(res.customer?.name ?? null)
        })
        .catch(() => {
          if (cancelled) return
          setCustomerBalance(null)
          setKnownCustomerName(null)
        })
        .finally(() => {
          if (!cancelled) setBalanceLoading(false)
        })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [customerDni, activeEventId, token])

  const posReady =
    !!token &&
    !!activeEventId &&
    !!activeBarId &&
    (!shiftBound || hasBoundShift)

  const { eventStock, connectionStatus, refreshSnapshot } =
    useEventStock(activeEventId || null, activeBarId || null, token, posReady)

  const [productBaselines, setProductBaselines] = useState<
    Record<string, number>
  >({})

  useEffect(() => {
    setProductBaselines({})
  }, [activeEventId])

  useEffect(() => {
    if (!posReady) return
    setProductBaselines((prev) => {
      let changed = false
      const next = { ...prev }
      for (const p of catalogProducts) {
        if (next[p.id] != null) continue
        const a = eventProductAvailabilityUnits(p, eventStock)
        if (!Number.isFinite(a)) continue
        next[p.id] = Math.max(a, 1)
        changed = true
      }
      return changed ? next : prev
    })
  }, [catalogProducts, eventStock, posReady])

  const filteredCatalog = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return catalogProducts
    return catalogProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [catalogProducts, productSearch])

  const catalogGroups = useMemo(() => {
    const byCat = new Map<
      string,
      { name: string | null; sortOrder: number; products: CatalogProduct[] }
    >()
    for (const p of filteredCatalog) {
      const key = p.categoryId ?? "__uncat__"
      const existing = byCat.get(key)
      if (existing) {
        existing.products.push(p)
      } else {
        byCat.set(key, {
          name: p.categoryId ? p.categoryName ?? "Categoría" : null,
          sortOrder: p.categoryId ? p.categorySortOrder ?? 0 : Number.MAX_SAFE_INTEGER,
          products: [p],
        })
      }
    }
    return [...byCat.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          (a.name ?? "").localeCompare(b.name ?? "")
      )
  }, [filteredCatalog])

  const eventStockProducts = useMemo(
    () =>
      catalogProducts.map((product) => {
        const available = eventProductAvailabilityUnits(product, eventStock)
        return {
          product,
          available,
          visual: stockVisualForProduct(available, productBaselines[product.id]),
        }
      }),
    [catalogProducts, eventStock, productBaselines]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  )

  const addToCart = useCallback(
    (product: CatalogProduct) => {
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
    },
    []
  )

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      setCart((prev) => {
        const item = prev.find((i) => i.product.id === productId)
        if (!item) return prev
        return prev
          .map((it) =>
            it.product.id === productId
              ? { ...it, quantity: Math.max(0, it.quantity + delta) }
              : it
          )
          .filter((it) => it.quantity > 0)
      })
    },
    []
  )

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const handleCobrar = useCallback(async () => {
    if (!token || !activeEventId || !activeBarId || cart.length === 0) return
    setCheckoutSubmitting(true)
    try {
      const res = await apiFetch<SaleChargeResponse>("/inventory/sales", {
        method: "POST",
        token,
        body: JSON.stringify({
          eventId: activeEventId,
          barId: activeBarId,
          allowNegativeStock: true,
          paymentMethod: mapPayment(paymentMethod),
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
          })),
          ...(customerDni.trim() !== "" ? { customerDni: customerDni.trim() } : {}),
          ...(customerName.trim() !== "" ? { customerName: customerName.trim() } : {}),
          ...(promoterId !== "" ? { promoterId } : {}),
        }),
      })
      toast.success("Venta registrada")
      // Tarea 5.2 — Recibo + ticket canjeable (caja con DNI) apenas se cobra.
      void printSaleDocuments(res)
      clearCart()
      // Tarea 6.3 — El saldo se actualiza solo: al limpiar el DNI, el effect de consulta
      // lo resetea; el cobro contra saldo dejó el movimiento CONSUMO en el backend.
      setCustomerDni("")
      setCustomerName("")
      setPromoterId("")
      if (paymentMethod === "saldo") setPaymentMethod("cash")
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
    customerDni,
    customerName,
    promoterId,
    clearCart,
    bumpHistory,
    refreshSnapshot,
    printSaleDocuments,
  ])

  // Tarea 6.3 — Carga de saldo en caja (efectivo/tarjeta): entra plata de verdad, se crea una
  // venta POS sin items y se acredita el saldo del DNI (POST /events/:id/balance/charge-cash).
  const handleChargeBalance = useCallback(async () => {
    if (!token || !activeEventId || customerDni.trim().length < 6) return
    const amt = Number.parseFloat(chargeAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Ingresá un monto válido")
      return
    }
    setChargeSubmitting(true)
    try {
      const res = await apiFetch<{ ok: boolean; balance: string }>(
        `/events/${activeEventId}/balance/charge-cash`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            dni: customerDni.trim(),
            amount: chargeAmount,
            paymentMethod: chargeMethod,
            ...(customerName.trim() !== "" ? { name: customerName.trim() } : {}),
          }),
        }
      )
      setCustomerBalance(res.balance)
      setChargeOpen(false)
      setChargeAmount("")
      toast.success("Saldo cargado")
      // La carga queda como venta POS en el historial (y se separa en el cierre F10).
      bumpHistory()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cargar el saldo"
      )
    } finally {
      setChargeSubmitting(false)
    }
  }, [
    token,
    activeEventId,
    customerDni,
    customerName,
    chargeAmount,
    chargeMethod,
    bumpHistory,
  ])

  const backHref = isBartender ? "/settings" : "/"
  // En un dispositivo de puesto, "volver" = cerrar el turno (rota al próximo PIN).
  function endShift() {
    logout()
    if (posSession) navigate(`/pos/sesion/${posSession.token}`, { replace: true })
  }

  // Este hook debe ejecutarse antes de los retornos de los estados de turno. Al resolver
  // una barra asignada, el componente pasa de "cargando" al POS sin cambiar el orden de hooks.
  const balanceAmount = useMemo(() => {
    if (customerBalance == null) return null
    const n = Number.parseFloat(customerBalance)
    return Number.isFinite(n) ? n : null
  }, [customerBalance])

  if (shiftResolving) {
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

  if (shiftBound && !hasBoundShift) {
    return (
      <div className={cn("flex min-h-screen flex-col", shell)}>
        <header className="flex items-center justify-between border-b border-zinc-200/50 px-4 py-3 backdrop-blur-xl bg-white/70 dark:border-zinc-800/50 dark:bg-black/70 sm:px-6">
          {posSession ? (
            <button
              type="button"
              onClick={endShift}
              className="flex h-11 min-h-[44px] items-center justify-center rounded-xl px-3 text-[13px] font-medium text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
            >
              Cerrar turno
            </button>
          ) : (
            <Link
              to={backHref}
              className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          )}
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

  const showSelectors = !shiftBound
  const shiftLabel = boundShift
    ? `${boundShift.eventName} — ${boundShift.barName}`
    : null

  // Tarea 6.3 — Saldo en caja: con "Saldo" seleccionado, el cobro exige DNI y fondos
  // suficientes (el backend lo valida de nuevo; esto desactiva el botón antes de tiempo).
  const canCharge =
    posReady &&
    cart.length > 0 &&
    !checkoutSubmitting &&
    (paymentMethod !== "saldo" ||
      (customerDni.trim() !== "" &&
        balanceAmount != null &&
        balanceAmount >= cartTotal))

  return (
    <div
      className={cn(
        "flex h-[calc(100svh-1rem)] min-h-0 flex-col overflow-hidden sm:h-svh",
        shell
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200/50 px-3 py-3 backdrop-blur-xl bg-white/70 dark:border-zinc-800/50 dark:bg-black/70 sm:px-5">
        {posSession ? (
          <button
            type="button"
            onClick={endShift}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl px-3 text-[13px] font-medium text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
          >
            Cerrar turno
          </button>
        ) : (
          <Link
            to={backHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}

        <div className="min-w-0 flex-1 px-2 text-center">
          <h1 className="truncate text-[17px] font-bold tracking-tight text-foreground sm:text-lg">
            Punto de venta
          </h1>
          <p className="truncate text-[12px] text-[#8E8E93] dark:text-[#98989D]">
            {posSession
              ? `${staffName ?? "Staff"}${shiftLabel ? ` · ${shiftLabel}` : ""}`
              : shiftLabel ?? staffName ?? "Staff"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!posReady}
            onClick={() => navigate("/pos/escaner", { replace: true })}
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
        onOpenChange={handleScannerOpenChange}
        barId={posReady ? activeBarId : null}
        token={token}
        eventName={posEventName}
        barName={posBarName}
      />
      <SaleDetailsDialog
        saleId={selectedSaleId}
        token={token}
        onClose={() => setSelectedSaleId(null)}
      />
      {/* Tarea 6.3 — Carga de saldo en caja: efectivo o tarjeta acreditan el DNI. */}
      <Dialog open={eventStockOpen} onOpenChange={setEventStockOpen}>
        <DialogContent className="max-h-[80svh] max-w-lg overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4 pr-6">
              <div>
                <DialogTitle>Stock del evento</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Disponible para toda la caja, sin separar por barras.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void refreshSnapshot()}
                className="h-9 w-9 shrink-0 rounded-xl"
                aria-label="Actualizar stock del evento"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="max-h-[58svh] overflow-y-auto p-4">
            {eventStockProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No hay productos activos en este evento.
              </p>
            ) : (
              <ul className="space-y-2">
                {eventStockProducts.map(({ product, available, visual }) => (
                  <li
                    key={product.id}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-xl border px-4 py-3",
                      visual === "out" && "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20",
                      visual === "low" && "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
                      (visual === "ok" || visual === "unlimited") && "border-zinc-100 dark:border-zinc-800"
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {product.name}
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-zinc-700 dark:text-zinc-200">
                      {Number.isFinite(available)
                        ? `${Math.floor(available)} disp.`
                        : "Sin límite"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cargar saldo</DialogTitle>
            <DialogDescription>
              El saldo queda asociado al DNI{" "}
              <span className="font-semibold text-foreground">
                {customerDni.trim()}
              </span>{" "}
              dentro del evento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Monto
              </label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={chargeAmount}
                onChange={(e) =>
                  setChargeAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                className={cn(searchInputClass, "py-0")}
                aria-label="Monto a cargar"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Medio de pago
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChargeMethod("CASH")}
                  className={cn(
                    "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-all duration-300 active:scale-[0.98]",
                    chargeMethod === "CASH"
                      ? "border-[#FF9500] bg-[#FF9500] text-white"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                  )}
                >
                  <Banknote className="h-4 w-4" />
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setChargeMethod("CARD")}
                  className={cn(
                    "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-all duration-300 active:scale-[0.98]",
                    chargeMethod === "CARD"
                      ? "border-[#FF9500] bg-[#FF9500] text-white"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                  )}
                >
                  <CreditCard className="h-4 w-4" />
                  Tarjeta
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={chargeSubmitting}
              onClick={() => void handleChargeBalance()}
              className="h-11 w-full gap-2 rounded-2xl bg-[#FF9500] text-[15px] font-bold tracking-tight text-white transition-all duration-200 hover:bg-[#FF9500]/90 active:opacity-90 disabled:opacity-50"
            >
              {chargeSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {chargeSubmitting ? "Cargando…" : "Cargar saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          Stock en vivo desconectado — el stock del evento se actualiza cada 25s.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 lg:grid-cols-12 lg:gap-5 lg:p-5">
        {/* Catálogo */}
        <section className={cn(panelClass, "lg:col-span-5")}>
          <div className="shrink-0 space-y-3 border-b border-zinc-200/50 p-4 dark:border-zinc-800/50 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Productos del evento
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!posReady}
                onClick={() => setEventStockOpen(true)}
                className="h-9 shrink-0 gap-1.5 rounded-xl text-xs font-semibold"
              >
                <Package className="h-3.5 w-3.5" />
                Stock del evento
              </Button>
            </div>
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
                {shiftBound ? "Cargando…" : "Elegí evento y barra para vender"}
              </p>
            ) : catalogLoading ? (
              <p className="py-10 text-center text-base text-zinc-500 dark:text-zinc-400">
                Cargando catálogo…
              </p>
            ) : filteredCatalog.length === 0 ? (
              <p className="py-10 text-center text-base text-zinc-500 dark:text-zinc-400">
                {catalogProducts.length === 0
                  ? "No hay productos activos en este evento."
                  : "Nada coincide con la búsqueda."}
              </p>
            ) : (
              <div className="space-y-6">
                {catalogGroups.map((group) => (
                  <div key={group.id}>
                    {group.name ? (
                      <p className="mb-2.5 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        {group.name}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                      {group.products.map((product) => {
                        const avail = eventProductAvailabilityUnits(product, eventStock)
                        const baseline = productBaselines[product.id]
                        const vis = stockVisualForProduct(avail, baseline)
                        const hasStockWarning = vis === "low" || vis === "out"
                        return (
                          <Card
                            key={product.id}
                            size="sm"
                            role="button"
                            tabIndex={0}
                            onClick={() => addToCart(product)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                addToCart(product)
                              }
                            }}
                            className={cn(
                              "relative gap-3 rounded-2xl border py-4 shadow-none ring-0 transition-all duration-300 dark:bg-zinc-950/30",
                              "cursor-pointer border-zinc-100 bg-zinc-50/50 hover:bg-zinc-100/80 active:scale-[0.98] dark:border-zinc-800 dark:hover:bg-zinc-800/50",
                              vis === "ok" && "border-zinc-200 dark:border-zinc-700",
                              vis === "low" && "border-amber-200 dark:border-amber-900/50",
                              vis === "out" && "border-red-200 dark:border-red-900/50"
                            )}
                          >
                            {hasStockWarning ? (
                              <span
                                className={cn(
                                  "absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider",
                                  vis === "out" &&
                                    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
                                  vis === "low" &&
                                    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                                )}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {vis === "out" ? "Sin stock" : "Stock bajo"}
                              </span>
                            ) : null}
                            <CardHeader className="px-4 py-0 pr-20">
                              <CardTitle className="text-base font-bold leading-tight tracking-tight text-zinc-950 dark:text-white">
                                {product.name}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-0 pt-0">
                              <p
                                className="text-lg font-black tabular-nums tracking-tight text-[#FF9500]"
                              >
                                ${product.price.toFixed(2)}
                              </p>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                ))}
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
                  const avail = eventProductAvailabilityUnits(item.product, eventStock)
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

            {/* Tarea 5.1 — Venta en caja: DNI (y nombre) opcionales. Con DNI la venta queda
                a nombre del cliente (identidad del evento) — requisito de la visión §2.6. */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Cliente (opcional)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[7.5rem_1fr]">
                <Input
                  inputMode="numeric"
                  placeholder="DNI"
                  value={customerDni}
                  onChange={(e) =>
                    setCustomerDni(e.target.value.replace(/\D/g, "").slice(0, 11))
                  }
                  className={cn(searchInputClass, "py-0")}
                  aria-label="DNI del cliente"
                />
                <Input
                  placeholder="Nombre (si no está registrado)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={cn(searchInputClass, "py-0")}
                  aria-label="Nombre del cliente"
                />
              </div>
              {/* Tarea 6.3 — Con un DNI válido: saldo disponible del cliente + carga de saldo
                  en caja (efectivo/tarjeta). El nombre registrado confirma la identidad. */}
              {customerDni.trim().length >= 6 ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      Saldo disponible
                    </p>
                    <p className="text-[15px] font-black tabular-nums text-zinc-950 dark:text-white">
                      {balanceLoading && balanceAmount == null
                        ? "…"
                        : `$${(balanceAmount ?? 0).toFixed(2)}`}
                    </p>
                    {knownCustomerName ? (
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {knownCustomerName}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChargeOpen(true)}
                    className="h-9 shrink-0 gap-1 rounded-xl text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Cargar saldo
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Tarea 9.1 — Promotor de la venta (opcional): se atribuye al promotor para el
                reporte por promotor (9.2). "Sin promotor" = valor especial "none" (Radix no
                admite SelectItem con value ""). */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  Promotor
                </p>
                {promoterId !== "" ? (
                  <button
                    type="button"
                    onClick={() => setPromoterId("")}
                    className="flex h-6 items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                ) : null}
              </div>
              <Select
                value={promoterId === "" ? "none" : promoterId}
                onValueChange={(v) => setPromoterId(v === "none" ? "" : v)}
              >
                <SelectTrigger className={cn(selectTriggerClass, "h-11")}>
                  <SelectValue placeholder="Sin promotor" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                  <SelectItem value="none" className="rounded-lg py-2.5">
                    Sin promotor
                  </SelectItem>
                  {promoters.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="rounded-lg py-2.5">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tarea 5.2 — Selector de impresora térmica (recibo y ticket canjeable). */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  Impresora
                </p>
                <button
                  type="button"
                  onClick={() => void refreshPrinters()}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="Actualizar impresoras"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <Select
                value={selectedPrinter ?? ""}
                onValueChange={setSelectedPrinter}
              >
                <SelectTrigger className={cn(selectTriggerClass, "h-11")}>
                  <SelectValue placeholder="Elegí impresora" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-zinc-200/50 dark:border-zinc-800/50">
                  {printers.map((p) => (
                    <SelectItem key={p} value={p} className="rounded-lg py-2.5">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {/* Tarea 6.3 — Cobro contra el saldo del DNI (visión §2.7: "da el DNI y le dan
                    el ticket"). Requiere DNI; el saldo se muestra arriba al tipearlo. */}
                <button
                  type="button"
                  disabled={customerDni.trim() === ""}
                  onClick={() => setPaymentMethod("saldo")}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-bold transition-all duration-300 active:scale-[0.98] sm:text-sm",
                    paymentMethod === "saldo"
                      ? "bg-[#FF9500] text-white dark:bg-[#FF9500]"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80",
                    customerDni.trim() === "" &&
                      "cursor-not-allowed opacity-40 hover:bg-transparent dark:hover:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      paymentMethod === "saldo"
                        ? "bg-white/20"
                        : "bg-zinc-100 dark:bg-zinc-800"
                    )}
                  >
                    <Wallet
                      className={cn(
                        "h-5 w-5",
                        paymentMethod === "saldo"
                          ? "text-white"
                          : "text-zinc-600 dark:text-zinc-300"
                      )}
                    />
                  </span>
                  Saldo
                </button>
              </div>
              {/* Tarea 6.3 — Aviso cuando el saldo elegido no alcanza para el pedido. */}
              {paymentMethod === "saldo" &&
              customerDni.trim() !== "" &&
              balanceAmount != null &&
              cartTotal > 0 &&
              balanceAmount < cartTotal ? (
                <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  Saldo insuficiente — disponible ${balanceAmount.toFixed(2)}
                </p>
              ) : null}
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
