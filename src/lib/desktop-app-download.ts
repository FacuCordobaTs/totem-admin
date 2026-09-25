import { getApiBase } from "@/lib/api"

/**
 * Manifiesto del updater (`admin/src-tauri/tauri.conf.json` apunta al mismo archivo). El backend
 * lo sirve estático desde `backend/public/updates/`, así que en producción da
 * `https://api.crow.ar/public/updates/latest.json` y en dev `http://localhost:3000/...`.
 */
const MANIFEST_PATH = "/public/updates/latest.json"

/** El release publica un solo artefacto: el instalador NSIS de Windows. */
const WINDOWS_PLATFORM = "windows-x86_64"

export type DesktopRelease = {
  version: string
  notes: string | null
  downloadUrl: string
}

export function getUpdatesManifestUrl(): string {
  return `${getApiBase()}${MANIFEST_PATH}`
}

/**
 * `latest.json` es un documento externo al bundle: puede faltar, estar a medio publicar o cambiar
 * de forma. Ante cualquier duda se devuelve `null` para que la tarjeta muestre el error en vez de
 * un enlace roto; el instalador se descarga por HTTPS desde el dominio del backend.
 */
export function parseLatestManifest(payload: unknown): DesktopRelease | null {
  if (typeof payload !== "object" || payload === null) return null
  const manifest = payload as Record<string, unknown>

  const version = typeof manifest.version === "string" ? manifest.version.trim() : ""
  if (!version) return null

  const platforms = manifest.platforms
  if (typeof platforms !== "object" || platforms === null) return null
  const platform = (platforms as Record<string, unknown>)[WINDOWS_PLATFORM]
  if (typeof platform !== "object" || platform === null) return null

  const rawUrl = (platform as Record<string, unknown>).url
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null
  let downloadUrl: URL
  try {
    downloadUrl = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (downloadUrl.protocol !== "https:" && downloadUrl.protocol !== "http:") return null

  return {
    version,
    notes: typeof manifest.notes === "string" && manifest.notes.trim() ? manifest.notes.trim() : null,
    downloadUrl: downloadUrl.toString(),
  }
}
