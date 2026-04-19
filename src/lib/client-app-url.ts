/**
 * Base URL for the public attendee client (guest checkout / event shop).
 * Set `VITE_CLIENT_URL` in production when the admin app is hosted separately.
 */
export function getClientAppBaseUrl(): string {
  const raw = import.meta.env.VITE_CLIENT_URL
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/$/, "")
  }
  if (import.meta.env.DEV) {
    return "http://localhost:5173"
  }
  return typeof window !== "undefined" ? window.location.origin : ""
}

/** Full URL to the event shop (`/e/:eventId`) for sharing with attendees. */
export function getEventShopUrl(eventId: string): string {
  return `${getClientAppBaseUrl()}/e/${eventId}`
}
