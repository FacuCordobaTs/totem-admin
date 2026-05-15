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
  isActive: boolean | null
  createdAt: string | null
  /** ISO 8601 UTC; null = guest ticket sales not deferred by schedule */
  ticketsAvailableFrom: string | null
  /** ISO 8601 UTC; null = guest consumption sales not deferred by schedule */
  consumptionsAvailableFrom: string | null
}
