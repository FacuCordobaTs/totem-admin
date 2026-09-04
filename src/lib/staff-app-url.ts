/**
 * The desktop app is not a URL a phone can open. QR handoffs therefore always
 * point to the public web admin, with an optional staging/custom override.
 */
const PRODUCTION_ADMIN_ORIGIN = "https://admin.crow.ar"

export function getStaffAppBaseUrl(): string {
  const configured = import.meta.env.VITE_ADMIN_URL?.trim()
  return (configured || PRODUCTION_ADMIN_ORIGIN).replace(/\/$/, "")
}

export function getStaffLoginUrl(access: "pos" | "security"): string {
  const params = new URLSearchParams({ access })
  return `${getStaffAppBaseUrl()}/login?${params.toString()}`
}
