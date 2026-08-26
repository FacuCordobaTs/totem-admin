import type { EventStatus } from "@/lib/event-status"
import type { EventPromoterSalesRow } from "./event-dashboard"

/**
 * Tarea 10.1 — Cierre de caja POR PUESTO (visión §2.8). Espejo del tipo del backend
 * (`CashClosingEntry` en `schema.ts`). `expected` = efectivo (CASH) que debería haber en el
 * cajón; `counted` = lo contado a mano (null = no se contó); `byMethod` desglosa el esperado.
 */
export type CashClosingEntry = {
  /** null = caja de puerta (ventas sin puesto asignado). */
  barId: string | null
  barName: string
  expected: string
  counted: string | null
  byMethod: {
    method: "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER" | "SALDO"
    expected: string
  }[]
}

/**
 * Liquidación congelada de la ceremonia de cierre (tarea 4.4). Espejo del tipo del backend
 * (`EventClosingReport` en `schema.ts`). Cifras monetarias como string decimal. `cashes`
 * (10.1) reemplaza al `cash` único; `cash` queda como agregado por back-compat (los eventos
 * cerrados antes de 10.1 no tienen `cashes`).
 */
export type EventClosingReport = {
  closedAt: string
  income: { tickets: string; bar: string; gross: string }
  expenses: {
    operational: string
    merchandisePurchased: string
    merchandiseConsumed: string
  }
  leftoverValue: string
  netReal: string
  netProjected: string
  cash: { expected: string; counted: string } | null
  cashes: CashClosingEntry[]
  /**
   * Tarea 10.2 — Pendiente de entrega (visión §2.8). Espejo del tipo del backend: tragos
   * vendidos y NO retirados al cerrar. `quantity` = consumiciones PENDING; `amount` = su valor
   * al momento (plata cobrada que se debe). Opcional por back-compat: los eventos cerrados
   * antes de 10.2 no lo tienen.
   */
  pendingDelivery?: { quantity: number; amount: string }
  /**
   * Tarea 10.3 — Ingresos por ORIGEN (visión §2.8): entradas / tragos / saldo cargado. Espejo
   * del backend. Opcional por back-compat: los eventos cerrados antes de 10.3 no lo tienen.
   */
  incomeBySource?: {
    tickets: string
    tragos: string
    saldo: string
    total: string
  }
  /**
   * Tarea 10.3 — Ingresos por MÉTODO de pago. Incluye las cargas de saldo por su método
   * (un depósito en efectivo es efectivo que entró); SALDO figura por transparencia (tragos
   * pagados con saldo ya cargado — no es plata nueva).
   */
  incomeByMethod?: {
    method: "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER" | "SALDO"
    amount: string
  }[]
  /** Tarea 10.3 — Ventas completadas por hora (shape de `analytics/dashboard`). */
  salesByHour?: { hour: number; label: string; revenue: number }[]
  /** Tarea 10.3 — Top productos por unidades vendidas (shape de `bar-sales`). */
  topProducts?: { productName: string; quantitySold: number; revenue: string }[]
  /**
   * Tarea 10.3 — Rendimiento por barra/puesto ordenado por recaudado desc. `barId` null =
   * "Puerta" (ventas sin puesto).
   */
  barPerformance?: {
    barId: string | null
    barName: string
    revenue: string
    salesCount: number
  }[]
  /** Tarea 10.3 — Ventas por promotor (mismo shape que `GET /events/:id/promoter-sales`). */
  byPromoter?: EventPromoterSalesRow[]
  insumos: {
    inventoryItemId: string
    name: string
    countingUnit: string
    estimated: number
    counted: number
    purchased: number
    unitCost: string
    consumedCost: string
    leftoverValue: string
    mermaUnits: number
    mermaValue: string
  }[]
}

export type ApiEvent = {
  id: string
  tenantId: string
  name: string
  /** URL-friendly identifier: crow.ar/e/{slug}. null = sin slug personalizado. */
  slug: string | null
  date: string
  location: string | null
  /** URL pública (R2 u otro CDN) */
  imageUrl?: string | null
  /** Diseño de la página pública: GLASS = glassmorphism (default), MINIMAL = plano/minimalista. */
  designType?: "GLASS" | "MINIMAL"
  /** Tarea 3.1 — Edad mínima para entrar (+18: 18). null = sin restricción. La lee el escáner de DNI. */
  ageRestriction?: number | null
  /** Estado del ciclo de vida (máquina de 4 estados). Fuente de verdad del header/Resumen. */
  status: EventStatus
  /** ISO 8601 — hora de puertas programada (trigger automático on_sale→live). */
  doorsAt?: string | null
  /** ISO 8601 — instante efectivo en que se abrió la venta (draft→on_sale). */
  salesOpenedAt?: string | null
  /** ISO 8601 — instante efectivo en que pasó a En vivo (on_sale→live). */
  wentLiveAt?: string | null
  /** ISO 8601 — instante efectivo en que se cerró (live→closed). */
  closedAt?: string | null
  /** Liquidación congelada de la ceremonia de cierre (4.4). Null hasta cerrar. */
  closingReport?: EventClosingReport | null
  createdAt: string | null
  /** ISO 8601 UTC; null = guest ticket sales not deferred by schedule */
  ticketsAvailableFrom: string | null
  /** ISO 8601 UTC; null = guest consumption sales not deferred by schedule */
  consumptionsAvailableFrom: string | null
}
