const LOCAL_API_URL = "http://localhost:3000"
const PRODUCTION_API_URL = "https://api.crow.ar"

/**
 * A release build runs inside Tauri, not beside the local Bun server. Keeping a
 * production fallback here prevents an installer built without a .env file from
 * silently trying to authenticate against localhost.
 */
const base = () => {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (configured) return configured
  return import.meta.env.DEV ? LOCAL_API_URL : PRODUCTION_API_URL
}

export function getApiBase(): string {
  return base().replace(/\/$/, "")
}

/** Base URL for WebSocket (staff stock channel). */
export function getWsBase(): string {
  const b = getApiBase()
  if (b.startsWith("https://")) {
    return `wss://${b.slice("https://".length)}`
  }
  return `ws://${b.replace(/^http:\/\//, "")}`
}

type Json = Record<string, unknown>

export class ApiError extends Error {
  status: number
  body: Json | null

  constructor(message: string, status: number, body: Json | null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)
  if (
    !headers.has("Content-Type") &&
    rest.body &&
    !(rest.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json")
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...rest,
    headers,
    credentials: "include",
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const errBody = data && typeof data === "object" ? (data as Json) : null
    const msg =
      errBody && typeof errBody.error === "string"
        ? errBody.error
        : `Error ${res.status}`
    throw new ApiError(msg, res.status, errBody)
  }

  return data as T
}

/** Rutas públicas (sin cookie ni token). */
export async function publicApiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    credentials: "omit",
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const errBody = data && typeof data === "object" ? (data as Json) : null
    const msg =
      errBody && typeof errBody.error === "string"
        ? errBody.error
        : `Error ${res.status}`
    throw new ApiError(msg, res.status, errBody)
  }

  return data as T
}
