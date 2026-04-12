/**
 * Extrae el qrHash del contenido del QR: URL de validación (…/v/{hash}) o hash en crudo.
 */
export function parseQrHash(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return decodeURIComponent(last)
  } catch {
    /* no es una URL absoluta */
  }

  return trimmed
}
