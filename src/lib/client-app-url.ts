/**
 * Base URL for the public attendee client (guest checkout / event shop).
 * Production default: crow.ar. Override with VITE_CLIENT_URL for staging or custom hosts.
 */
const PRODUCTION_CLIENT_ORIGIN = "https://crow.ar"

export function getClientAppBaseUrl(): string {
  const raw = import.meta.env.VITE_CLIENT_URL
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/$/, "")
  }
  if (import.meta.env.DEV) {
    return "http://localhost:5173"
  }
  return PRODUCTION_CLIENT_ORIGIN
}

/** Full URL to the event shop. The public route accepts either a slug or an event id. */
export function getEventShopUrl(eventSlugOrId: string): string {
  return `${getClientAppBaseUrl()}/${encodeURIComponent(eventSlugOrId)}`
}

/** Link público de un evento que atribuye el checkout al promotor indicado. */
export function getPromoterEventShopUrl(eventSlugOrId: string, promoterId: string): string {
  return `${getEventShopUrl(eventSlugOrId)}?promotor=${encodeURIComponent(promoterId)}`
}

/**
 * Full URL of a nominated courtesy/invitation (`/i/:token`) for sharing with a guest.
 * The client resolves it against `GET /public/courtesies/:token` so the guest can redeem
 * their free ticket. (Spec §4.2 — cortesías: links nominados, contados aparte.)
 */
export function getCourtesyUrl(token: string): string {
  return `${getClientAppBaseUrl()}/i/${token}`
}
