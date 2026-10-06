import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Decimal from "decimal.js"
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
  AlertTriangle,
  Package,
  EllipsisVertical,
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
import { apiFetch } from "@/lib/api"
import { LogoutButton } from "@/components/auth/logout-button"
import { useAuthStore } from "@/stores/auth-store"
import { usePosSessionStore } from "@/stores/pos-session-store"
import { usePosAssignmentStore } from "@/stores/pos-assignment-store"
import type { ApiEvent } from "@/types/events"
import { eventSupportsConsumptions } from "@/lib/event-operation-mode"
import type { EventBarsResponse, EventSalesPageResponse } from "@/types/event-dashboard"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PosScannerModal } from "@/components/pos/PosScannerModal"
import { SaleDetailsDialog } from "@/components/pos/SaleDetailsDialog"
import { useEventStock } from "@/hooks/useEventStock"
import type { RecipeLine } from "@/lib/product-availability"
import { usePrinter } from "@/context/PrinterContext"
import { usePosOffline } from "@/hooks/usePosOffline"
import { buildPosDocuments, enqueuePosSale, posCachedFetch, printPosSale, updatePosSale, type PosQueuedSale, type PosSaleBody } from "@/lib/pos-offline"

interface CatalogProduct {
  id: string
  name: string
  price: string
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number | null
  recipes: RecipeLine[]
  /** Productos sin receta: null significa que no tienen límite de unidades. */
  directStock: string | null
}

interface ProductCartItem {
  kind: "product"
  product: CatalogProduct
  quantity: number
}

/** Ítem virtual: se muestra y se cobra como parte del pedido, pero no descuenta stock. */
interface BalanceChargeCartItem {
  kind: "balance-charge"
  amount: string
}

type CartItem = ProductCartItem | BalanceChargeCartItem

type PosShift = {
  eventId: string
  barId: string
  eventName: string
  barName: string
}

type StaffShiftApi = {
  shift: PosShift | null
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
  const { owner, sales: localSales, online: isOnline, syncing, storageError, sync } = usePosOffline()
  const checkoutLock = useRef(false)
  const cachedFetch = useCallback(<T,>(path: string, options: { token?: string | null; method?: string }) => {
    if (!owner || !options.token) return apiFetch<T>(path, { ...options, signal: AbortSignal.timeout(3000) })
    return posCachedFetch<T>(path, owner, options.token)
  }, [owner])
  const staffName = useAuthStore((s) => s.staff?.name)
  const role = useAuthStore((s) => s.staff?.role)
  const logout = useAuthStore((s) => s.logout)
  const isBartender = role === "BARTENDER"

  // Sesión de puesto
  const posSession = usePosSessionStore((s) => s.session)
  const deviceShift = useMemo<PosShift | null>(() =>
    posSession && posSession.barId
      ? {
          eventId: posSession.eventId,
          barId: posSession.barId,
          eventName: posSession.eventName,
          barName: posSession.barName ?? "",
        }
      : null, [posSession])

  // Barra que el teléfono fijó a ESTA computadora al vincularla por QR. Persiste hasta reasignar,
  // así que sobrevive al logout: si después entra un empleado con email y contraseña, el POS abre
  // ya fijado a ese puesto.
  const assignedShiftRaw = usePosAssignmentStore((s) => s.assignment)
  const clearAssignment = usePosAssignmentStore((s) => s.clear)
  const assignedShift: PosShift | null = assignedShiftRaw
  // Un puesto con PIN manda: mientras exista, la asignación por QR queda latente y no se valida.
  const posSessionFixesBar = !!posSession?.barId

  const [shiftPhase, setShiftPhase] = useState<"idle" | "loading" | "ready">("idle")
  const [lockedShift, setLockedShift] = useState<PosShift | null>(null)

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [posBars, setPosBars] = useState<{ id: string; name: string }[]>([])
  const [posBarId, setPosBarId] = useState<string>("")

  // Lo que fija ESTA computadora (puesto con PIN, o barra asignada por QR) manda sobre el turno
  // propio del bartender.
  const fixedShift = deviceShift ?? assignedShift
  const hasFixedShift = !!fixedShift
  const boundShift = fixedShift ?? (isBartender ? lockedShift : null)
  const hasBoundShift = !!boundShift
  const shiftBound = hasFixedShift || isBartender
  const shiftResolving = isBartender && !fixedShift && shiftPhase !== "ready"

  const activeEventId = boundShift ? boundShift.eventId : eventId
  const activeBarId = boundShift ? boundShift.barId : posBarId
  const syncedSalesCount = localSales.filter((sale) => sale.body.eventId === activeEventId && sale.body.barId === activeBarId && sale.syncStatus === "synced").length

  const posEventName =
    boundShift?.eventName ?? events.find((e) => e.id === activeEventId)?.name ?? null
  const posBarName =
    boundShift?.barName ?? posBars.find((b) => b.id === activeBarId)?.name ?? null

  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [tracksStock, setTracksStock] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<{ eventId: string; barId: string; id: string } | null>(null)
  const [eventStockOpen, setEventStockOpen] = useState(false)

  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<UiPayment>("cash")
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)

  // Pestaña activa en la tercera columna
  const [activeTab, setActiveTab] = useState<"pedido" | "historial">("pedido")

  const [customerDni, setCustomerDni] = useState("")
  const [customerName, setCustomerName] = useState("")

  const [customerBalance, setCustomerBalance] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [knownCustomerName, setKnownCustomerName] = useState<string | null>(null)

  const [chargeOpen, setChargeOpen] = useState(false)
  const [chargeAmount, setChargeAmount] = useState("")

  const [settingsOpen, setSettingsOpen] = useState(false)

  const [historySales, setHistorySales] = useState<EventSalesPageResponse["sales"]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNonce, setHistoryNonce] = useState(0)

  const isScannerRoute = location.pathname === "/pos/escaner"
  const [scannerOpen, setScannerOpen] = useState(isScannerRoute)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  useEffect(() => {
    if (isScannerRoute) setScannerOpen(true)
  }, [isScannerRoute])

  const handleScannerOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isScannerRoute) {
        navigate("/pos", { replace: true })
        return
      }
      setScannerOpen(open)
    },
    [isScannerRoute, navigate]
  )

  const { printers, selectedPrinter, setSelectedPrinter, refreshPrinters, printRaw } =
    usePrinter()

  useEffect(() => {
    if (!token) {
      setShiftPhase("idle")
      setLockedShift(null)
      return
    }
    if (!isBartender || hasFixedShift) {
      setShiftPhase("ready")
      setLockedShift(null)
      return
    }
    setShiftPhase("loading")
    setLockedShift(null)
    void cachedFetch<StaffShiftApi>("/staff/me/shift", { method: "GET", token })
      .then((res) => {
        setLockedShift(res.shift)
      })
      .catch(() => {
        setLockedShift(null)
      })
      .finally(() => {
        setShiftPhase("ready")
      })
  }, [token, isBartender, hasFixedShift, cachedFetch])

  useEffect(() => {
    if (!token || isBartender || hasFixedShift) {
      if (!token) setEvents([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const evRes = await cachedFetch<{ events: ApiEvent[] }>("/events", {
          method: "GET",
          token,
        })
        if (cancelled) return
        const evs = evRes.events.filter(
          (e) => e.status !== "closed" && eventSupportsConsumptions(e.operationMode)
        )
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
  }, [token, isBartender, hasFixedShift, cachedFetch])

  useEffect(() => {
    if (!boundShift) return
    setEventId(boundShift.eventId)
    setPosBars([{ id: boundShift.barId, name: boundShift.barName }])
    setPosBarId(boundShift.barId)
  }, [boundShift])

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
        const res = await cachedFetch<EventBarsResponse>(`/events/${eventId}/bars`, {
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
  }, [token, eventId, boundShift, cachedFetch])

  // La barra asignada por QR sobrevive al logout, así que puede quedar apuntando a un evento ya
  // cerrado o a una barra desactivada: el POS quedaría fijo y sin selectores, sin salida salvo
  // re-escanear. Se valida contra los mismos endpoints que usa el POS y, si el puesto ya no sirve,
  // se libera avisando. Un fallo de red NO libera nada: no se desarma el puesto por un timeout.
  useEffect(() => {
    if (!token || !assignedShiftRaw || posSessionFixesBar) return
    let cancelled = false
    void (async () => {
      let usable = false
      try {
        const evRes = await cachedFetch<{ events: ApiEvent[] }>("/events", { method: "GET", token })
        const ev = evRes.events.find((e) => e.id === assignedShiftRaw.eventId)
        usable = !!ev && ev.status !== "closed" && eventSupportsConsumptions(ev.operationMode)
        if (usable) {
          const barsRes = await cachedFetch<EventBarsResponse>(
            `/events/${assignedShiftRaw.eventId}/bars`,
            { method: "GET", token }
          )
          usable = barsRes.bars.some(
            (b) => b.id === assignedShiftRaw.barId && b.isActive !== false
          )
        }
      } catch {
        return
      }
      if (cancelled || usable) return
      clearAssignment()
      toast.error("La barra asignada a esta computadora ya no está disponible")
    })()
    return () => {
      cancelled = true
    }
  }, [token, assignedShiftRaw, posSessionFixesBar, clearAssignment, cachedFetch])

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
        const res = await cachedFetch<{ products: BarCatalogRowApi[]; tracksStock?: boolean }>(
          `/bars/${activeBarId}/products?eventId=${encodeURIComponent(activeEventId)}`,
          { method: "GET", token }
        )
        if (cancelled) return
        setTracksStock(res.tracksStock !== false)
        const rows = res.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
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
  }, [token, activeEventId, activeBarId, shiftResolving, shiftBound, hasBoundShift, cachedFetch, isOnline, syncedSalesCount])

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
        const res = await cachedFetch<EventSalesPageResponse>(
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
  }, [token, activeEventId, activeBarId, historyNonce, shiftResolving, shiftBound, hasBoundShift, cachedFetch, isOnline, syncedSalesCount])

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
        { method: "GET", token, signal: AbortSignal.timeout(3000) }
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
    useEventStock(activeEventId || null, activeBarId || null, token, posReady && tracksStock)

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

  const catalogCategories = useMemo(() => {
    const categories = new Map<string, { id: string; name: string; sortOrder: number; count: number }>()
    for (const p of catalogProducts) {
      const id = p.categoryId ?? "__uncat__"
      const category = categories.get(id) ?? {
        id, name: p.categoryName ?? "Sin categoría",
        sortOrder: p.categoryId ? p.categorySortOrder ?? 0 : Number.MAX_SAFE_INTEGER, count: 0,
      }
      category.count++
      categories.set(id, category)
    }
    return [...categories.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"))
  }, [catalogProducts])
  const selectedCategory = categoryFilter?.eventId === activeEventId && categoryFilter?.barId === activeBarId && catalogCategories.some((c) => c.id === categoryFilter.id)
    ? categoryFilter.id : "__all__"

  const filteredCatalog = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const q = normalize(productSearch.trim())
    return catalogProducts.filter((p) =>
      (selectedCategory === "__all__" || (p.categoryId ?? "__uncat__") === selectedCategory) &&
      (!q || normalize(`${p.name} ${p.categoryName ?? ""}`).includes(q))
    )
  }, [catalogProducts, productSearch, selectedCategory])

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
          name: p.categoryId ? p.categoryName ?? "Categoría" : "Sin categoría",
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
    () =>
      cart.reduce(
        (sum, item) =>
          sum.plus(
          (item.kind === "product"
            ? new Decimal(item.product.price).times(item.quantity)
            : item.amount)),
        new Decimal(0)
      ),
    [cart]
  )

  const balanceChargeAmount = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum.plus(item.kind === "balance-charge" ? item.amount : 0),
        new Decimal(0)
      ),
    [cart]
  )

  const addToCart = useCallback(
    (product: CatalogProduct) => {
      setCart((prev) => {
        const existing = prev.find(
          (item): item is ProductCartItem =>
            item.kind === "product" && item.product.id === product.id
        )
        if (existing) {
          return prev.map((item) =>
            item.kind === "product" && item.product.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        return [...prev, { kind: "product", product, quantity: 1 }]
      })
    },
    []
  )

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      setCart((prev) => {
        const item = prev.find(
          (i): i is ProductCartItem =>
            i.kind === "product" && i.product.id === productId
        )
        if (!item) return prev
        return prev
          .map((it) =>
            it.kind === "product" && it.product.id === productId
              ? { ...it, quantity: Math.max(0, it.quantity + delta) }
              : it
          )
          .filter((it) => it.kind !== "product" || it.quantity > 0)
      })
    },
    []
  )

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) =>
      prev.filter((item) => item.kind !== "product" || item.product.id !== productId)
    )
  }, [])

  const removeBalanceCharge = useCallback(() => {
    setCart((prev) => prev.filter((item) => item.kind !== "balance-charge"))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const relevantLocalSales = localSales.filter((sale) => sale.body.eventId === activeEventId && sale.body.barId === activeBarId)
  const pendingSales = localSales.filter((sale) => sale.syncStatus === "pending")
  const blockedSales = localSales.filter((sale) => sale.syncStatus === "blocked")
  const recentLocalSales = relevantLocalSales.filter((sale, index) => sale.syncStatus !== "synced" || sale.printStatus !== "printed" || index >= relevantLocalSales.length - 15).reverse()

  const handleCobrar = useCallback(async () => {
    if (!token || !owner || !activeEventId || !activeBarId || cart.length === 0 || checkoutLock.current) return
    checkoutLock.current = true
    setCheckoutSubmitting(true)
    try {
      if (customerDni.trim() && customerDni.trim().length < 6) throw new Error("El DNI debe tener al menos seis dígitos")
      if (cartTotal.gt("99999999.99")) throw new Error("El importe del pedido supera el máximo permitido")
      if (cart.filter((item) => item.kind === "product").length > 100 || cart.some((item) => item.kind === "product" && item.quantity > 1000)) throw new Error("El pedido supera el máximo de productos por venta")
      const body: PosSaleBody = {
          requestId: crypto.randomUUID(),
          expectedTotalAmount: cartTotal.toFixed(2),
          eventId: activeEventId,
          barId: activeBarId,
          allowNegativeStock: true,
          paymentMethod: mapPayment(paymentMethod),
          items: cart
            .filter((c): c is ProductCartItem => c.kind === "product")
            .map((c) => ({ productId: c.product.id, quantity: c.quantity })),
          ...(balanceChargeAmount.gt(0)
            ? { balanceCharge: balanceChargeAmount.toFixed(2) }
            : {}),
          ...(customerDni.trim() !== "" ? { customerDni: customerDni.trim() } : {}),
          ...(customerName.trim() !== "" ? { customerName: customerName.trim() } : {}),
      }
      if (paymentMethod === "saldo" && !isOnline) throw new Error("Cobrar con saldo requiere conexión")
      const productItems = cart.filter((item): item is ProductCartItem => item.kind === "product")
      const createdAt = new Date().toISOString()
      if (paymentMethod !== "saldo") body.clientSale = {
        receiptToken: crypto.randomUUID(), createdAt,
        lines: productItems.map((item) => ({
          productId: item.product.id, priceAtTime: new Decimal(item.product.price).toFixed(2),
          qrHashes: Array.from({ length: item.quantity }, () => crypto.randomUUID()),
        })),
      }
      const sale: PosQueuedSale = {
        id: body.requestId, owner, body, createdAt,
        totalAmount: cartTotal.toFixed(2), eventName: posEventName ?? "Evento", barName: posBarName ?? "—",
        documents: [], printedDocuments: 0, printStatus: "pending", syncStatus: "pending",
        printSnapshot: {
          staffName, customerName: body.customerDni ? body.customerName || "Cliente" : null,
          hasCustomer: !!body.customerDni, hasProducts: !!body.items.length,
          items: cart.map((item) => item.kind === "product"
            ? { name: item.product.name, quantity: item.quantity, priceAtTime: item.product.price }
            : { name: "Carga de saldo", quantity: 1, priceAtTime: item.amount }),
        },
      }
      if (body.clientSale) sale.documents = buildPosDocuments(sale, sale.printSnapshot!, {
        message: "Venta guardada", saleId: sale.id, receiptToken: body.clientSale.receiptToken,
        totalAmount: sale.totalAmount,
        consumptions: body.clientSale.lines.flatMap((line, index) => line.qrHashes.map((qrHash) => ({
          qrHash, productName: productItems[index].product.name,
        }))),
      }, true)
      await enqueuePosSale(sale)
      if (sale.documents.length) void printPosSale(sale, printRaw).catch((error) => toast.error(
        "Venta guardada. No se pudo imprimir: " + (error instanceof Error ? error.message : String(error)),
      ))
      void sync()
      toast.success(paymentMethod === "saldo" ? "Pedido guardado; el ticket se imprime al confirmar el saldo" : "Venta guardada en este equipo; imprimiendo ticket")
      clearCart()
      setCustomerDni("")
      setCustomerName("")
      if (paymentMethod === "saldo") setPaymentMethod("cash")
      bumpHistory()
      void refreshSnapshot().catch(() => {})
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar la venta"
      )
    } finally {
      setCheckoutSubmitting(false)
      checkoutLock.current = false
    }
  }, [
    token,
    owner,
    isOnline,
    cartTotal,
    staffName,
    posBarName,
    posEventName,
    printRaw,
    sync,
    activeEventId,
    activeBarId,
    cart,
    balanceChargeAmount,
    paymentMethod,
    customerDni,
    customerName,
    clearCart,
    bumpHistory,
    refreshSnapshot,
  ])

  const handleAddBalanceCharge = useCallback(() => {
    if (customerDni.trim().length < 6) return
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(chargeAmount)) {
      toast.error("Ingresá un monto válido con hasta dos decimales")
      return
    }
    const amount = new Decimal(chargeAmount || 0)
    if (!amount.isFinite() || amount.lte(0)) {
      toast.error("Ingresá un monto válido")
      return
    }
    setCart((prev) => [
      ...prev.filter((item) => item.kind !== "balance-charge"),
      { kind: "balance-charge", amount: amount.toFixed(2) },
    ])
    setChargeOpen(false)
    setChargeAmount("")
  }, [customerDni, chargeAmount])

  const backHref = isBartender ? "/settings" : "/"
  function endShift() {
    logout()
    if (posSession) navigate(`/pos/sesion/${posSession.token}`, { replace: true })
  }

  // Cerrar sesión a diferencia de cerrar turno no conserva nada del puesto: la barra fijada a esta
  // computadora por QR se olvida, porque la próxima cuenta que entre puede ser de otra productora
  // y no debe heredar un puesto ajeno.
  const logoutButton = (
    <LogoutButton
      onBeforeLogout={clearAssignment}
      className="h-11 w-full rounded-2xl text-[15px] font-semibold"
    />
  )

  const balanceAmount = useMemo(() => {
    if (customerBalance == null) return null
    const n = new Decimal(customerBalance)
    return n.isFinite() ? n : null
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
            <div className="mt-8">{logoutButton}</div>
          </div>
        </div>
      </div>
    )
  }

  const showSelectors = !shiftBound
  const shiftLabel = posEventName && posBarName
    ? `${posEventName} — ${posBarName}`
    : null

  const canCharge =
    posReady &&
    cart.length > 0 &&
    !checkoutSubmitting &&
    !storageError &&
    !!owner &&
    (balanceChargeAmount.isZero() ||
      (customerDni.trim().length >= 6 && paymentMethod !== "saldo")) &&
    (paymentMethod !== "saldo" ||
      (customerDni.trim() !== "" &&
        balanceAmount != null &&
        isOnline && balanceAmount.gte(cartTotal)))

  return (
    <div
      className={cn(
        "flex min-h-svh flex-col lg:h-svh lg:min-h-0 lg:overflow-hidden",
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
            {staffName && shiftLabel ? `${staffName} · ${shiftLabel}` : shiftLabel ?? staffName ?? "Staff"}
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
            onClick={() => void sync()}
            className={cn(
              "flex h-11 max-w-[4.5rem] items-center justify-center rounded-xl px-2 text-[10px] font-medium leading-tight sm:max-w-none sm:text-[11px]",
              isOnline
                ? "text-[#8E8E93] dark:text-[#98989D]"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {syncing ? "Enviando…" : isOnline ? "Online" : "Offline"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[#8E8E93] transition-opacity active:opacity-70 dark:text-[#98989D]"
            aria-label="Opciones del puesto"
          >
            <EllipsisVertical className="h-5 w-5" />
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
      <Dialog open={tracksStock && eventStockOpen} onOpenChange={setEventStockOpen}>
        <DialogContent className="max-h-[80svh] max-w-lg overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4 pr-6">
              <div>
                <DialogTitle>Stock del evento</DialogTitle>
                <DialogDescription className="mt-1.5">
                  Disponible para toda la caja, sin separar por barras.
                </DialogDescription>
              </div>
              {tracksStock ? <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void refreshSnapshot()}
                className="h-9 w-9 shrink-0 rounded-xl"
                aria-label="Actualizar stock del evento"
              >
                <RefreshCw className="h-4 w-4" />
              </Button> : null}
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={handleAddBalanceCharge}
              className="h-11 w-full gap-2 rounded-2xl bg-[#FF9500] text-[15px] font-bold tracking-tight text-white transition-all duration-200 hover:bg-[#FF9500]/90 active:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Agregar al pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Opciones del puesto</DialogTitle>
            <DialogDescription>
              Barra, impresora de esta computadora y cierre de sesión.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="pos-bar"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
            >
              Barra
            </label>
            <Select
              value={activeBarId}
              onValueChange={setPosBarId}
              disabled={shiftBound || !posBars.length || checkoutSubmitting}
            >
              <SelectTrigger id="pos-bar" className={cn(selectTriggerClass, "h-11")}>
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
            {shiftBound ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                La barra está fijada al puesto o al turno asignado.
              </p>
            ) : null}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Impresora
              </label>
              <button
                type="button"
                onClick={() => void refreshPrinters()}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
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
          <DialogFooter>{logoutButton}</DialogFooter>
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
        </div>
      ) : null}

      {!isOnline && (
        <div className="shrink-0 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
          Sin conexión al servidor — podés cobrar e imprimir. Las ventas se enviarán automáticamente. Saldo requiere conexión.
        </div>
      )}

      {storageError && <div role="alert" className="shrink-0 bg-red-50 p-3 text-center text-sm text-red-800">{storageError}</div>}
      {(pendingSales.length > 0 || blockedSales.length > 0) && (
        <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{pendingSales.length} venta(s) por enviar · {blockedSales.length} requieren revisión. No vuelvas a cobrar estos pedidos.</span>
          <Button variant="outline" size="sm" disabled={syncing} onClick={() => void sync()}>{syncing ? "Enviando…" : "Enviar ahora"}</Button>
        </div>
      )}
      {localSales.length > 0 && (
        <details className="shrink-0 border-b border-zinc-200 bg-background px-4 py-2 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-semibold">Ventas de este equipo · pendientes y reimpresión</summary>
          <div className="max-h-52 overflow-y-auto py-2">
            {recentLocalSales.length === 0 && <p className="text-sm text-zinc-500">No hay ventas locales en este puesto.</p>}
            {recentLocalSales.map((sale) => (
              <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-2 text-sm dark:border-zinc-800">
                <div>
                  <p>{formatSaleTime(sale.createdAt)} · ${sale.response?.totalAmount ?? sale.totalAmount} · {formatPaymentLabel(sale.body.paymentMethod)}</p>
                  <p className="text-xs text-zinc-500">{sale.id} · {sale.syncStatus === "synced" ? "Enviada" : sale.syncStatus === "blocked" ? "Requiere revisión" : "Por enviar"} · {sale.printStatus === "printed" ? "Impresa" : sale.printStatus === "printing" ? "Impresión iniciada" : "Impresión pendiente"}</p>
                  {sale.syncError && <p className="text-xs text-amber-700 dark:text-amber-300">{sale.syncError}</p>}
                  {sale.syncStatus === "blocked" && <p className="text-xs text-zinc-500">{sale.printSnapshot?.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}{sale.body.customerDni ? ` · DNI ${sale.body.customerDni}` : ""}</p>}
                  {sale.printError && <p className="text-xs text-red-600">{sale.printError}</p>}
                </div>
                <div className="flex gap-2">
                  {sale.syncStatus === "blocked" && <Button size="sm" variant="outline" onClick={() => void updatePosSale(sale.id, { syncStatus: "pending", syncError: undefined }).then(sync).catch(() => toast.error("No se pudo actualizar la cola"))}>Reintentar envío</Button>}
                  {!!sale.documents.length && <Button size="sm" variant="outline" onClick={() => void printPosSale(sale, printRaw, true).catch((error) => toast.error(error instanceof Error ? error.message : String(error)))}>Reimprimir</Button>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {posReady && connectionStatus === "closed" && (
        <div className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Stock en vivo desconectado — el stock del evento se actualiza cada 25s.
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 items-start gap-4 p-3 lg:min-h-0 lg:grid-cols-12 lg:items-stretch lg:gap-5 lg:p-5">
        
        {/* Columna 1: Catálogo (lg:col-span-5) */}
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
            {catalogCategories.some((c) => c.id !== "__uncat__") ? (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar productos por categoría">
                {[{ id: "__all__", name: "Todos", count: catalogProducts.length }, ...catalogCategories].map((category) => (
                  <Button key={category.id} type="button" variant={selectedCategory === category.id ? "default" : "outline"} aria-pressed={selectedCategory === category.id} disabled={!posReady || catalogLoading} onClick={() => setCategoryFilter({ eventId: activeEventId, barId: activeBarId, id: category.id })} className="h-11 shrink-0 rounded-xl px-4">
                    {category.name} <span className="ml-1 text-xs opacity-60">{category.count}</span>
                  </Button>
                ))}
              </div>
            ) : null}
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
                  : "Nada coincide con la categoría y la búsqueda."}
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
                                ${new Decimal(product.price).toFixed(2)}
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

        {/* Columna 2: Checkout (lg:col-span-4) */}
        <section className={cn(panelClass, "lg:col-span-4")}>
          <div className="shrink-0 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Resumen
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tighter text-zinc-950 dark:text-white">
              Checkout
            </h2>
          </div>
          
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Total
              </span>
              <span className="text-4xl font-black tabular-nums tracking-tighter text-zinc-950 dark:text-white">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

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
                  maxLength={255}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={cn(searchInputClass, "py-0")}
                  aria-label="Nombre del cliente"
                />
              </div>
              {customerDni.trim().length >= 6 ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      Saldo disponible
                    </p>
                    <p className="text-[15px] font-black tabular-nums text-zinc-950 dark:text-white">
                      {balanceLoading && balanceAmount == null
                        ? "…"
                        : `$${(balanceAmount ?? new Decimal(0)).toFixed(2)}`}
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

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Pago
              </p>
              <div className="flex flex-wrap gap-2 rounded-[28px] border border-zinc-100 bg-background p-2 dark:border-zinc-800 ">
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
                <button
                  type="button"
                  disabled={customerDni.trim() === "" || !isOnline}
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
              {paymentMethod === "saldo" &&
              customerDni.trim() !== "" &&
              balanceAmount != null &&
              cartTotal.gt(0) &&
              balanceAmount.lt(cartTotal) ? (
                <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  Saldo insuficiente — disponible ${balanceAmount.toFixed(2)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/95 p-5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
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

        {/* Columna 3: Listados y Tabs (lg:col-span-3) */}
        <section className={cn(panelClass, "lg:col-span-3")}>
          <div className="shrink-0 flex items-center border-b border-zinc-100 px-2 pt-2 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50">
            <button
              type="button"
              onClick={() => setActiveTab("pedido")}
              className={cn(
                "relative px-4 py-3 text-[14px] font-bold transition-colors",
                activeTab === "pedido"
                  ? "text-zinc-950 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              )}
            >
              Este pedido
              {activeTab === "pedido" && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[#FF9500]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("historial")}
              className={cn(
                "relative px-4 py-3 text-[14px] font-bold transition-colors",
                activeTab === "historial"
                  ? "text-zinc-950 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              )}
            >
              Historial
              {activeTab === "historial" && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[#FF9500]" />
              )}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {activeTab === "pedido" ? (
              /* TAB: Este pedido (Carrito) */
              cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Tocá un producto para agregarlo
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {cart.map((item) => {
                    if (item.kind === "balance-charge") {
                      return (
                        <li
                          key="balance-charge"
                          className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-zinc-950 dark:text-white">Carga de saldo</p>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              Se acredita al cobrar
                            </p>
                            <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              ${item.amount}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Quitar carga de saldo"
                            onClick={removeBalanceCharge}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-all hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      )
                    }
                    const avail = eventProductAvailabilityUnits(item.product, eventStock)
                    const stockGone =
                      Number.isFinite(avail) &&
                      (avail <= 0 || item.quantity > avail)
                    return (
                      <li
                        key={item.product.id}
                        className={cn(
                          "flex items-stretch gap-2 rounded-2xl border p-3 transition-all duration-300",
                          stockGone
                            ? "border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/30"
                            : "border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/40"
                        )}
                      >
                        <div className="min-w-0 flex-1 self-center">
                          <p className="truncate font-bold text-sm text-zinc-950 dark:text-white">
                            {item.product.name}
                          </p>
                          {stockGone ? (
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                              Agotado
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              ${new Decimal(item.product.price).times(item.quantity).toFixed(2)}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label="Menos"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-background text-zinc-900 transition-all duration-300 hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-black tabular-nums text-zinc-950 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Más"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-background text-zinc-900 transition-all duration-300 hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Quitar"
                            onClick={() => removeFromCart(item.product.id)}
                            className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition-all duration-300 hover:bg-red-100 active:scale-[0.98] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : (
              /* TAB: Historial */
              !posReady ? (
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
              )
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
