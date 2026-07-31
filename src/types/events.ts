import type { EventStatus } from "@/lib/event-status"

/**
 * Liquidación congelada de la ceremonia de cierre (tarea 4.4). Espejo del tipo del backend
 * (`EventClosingReport` en `schema.ts`). Cifras monetarias como string decimal.
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
  isActive: boolean | null
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
