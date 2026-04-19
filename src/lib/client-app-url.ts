/**
 * Base URL for the public attendee client (guest checkout / event shop).
 * Production default: my.totem.uno. Override with VITE_CLIENT_URL for staging or custom hosts.
 */
const PRODUCTION_CLIENT_ORIGIN = "https://totem.uno"

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
