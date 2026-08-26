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

/** Full URL to the event shop (`/e/:eventId`) for sharing with attendees. */
export function getEventShopUrl(eventId: string): string {
  return `${getClientAppBaseUrl()}/e/${eventId}`
}

/**
 * Full URL of a nominated courtesy/invitation (`/i/:token`) for sharing with a guest.
 * The client resolves it against `GET /public/courtesies/:token` so the guest can redeem
 * their free ticket. (Spec §4.2 — cortesías: links nominados, contados aparte.)
 */
export function getCourtesyUrl(token: string): string {
  return `${getClientAppBaseUrl()}/i/${token}`
}
