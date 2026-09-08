/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Public web admin URL used by desktop QR handoffs (default: https://admin.crow.ar). */
  readonly VITE_ADMIN_URL?: string
  /** Optional override for attendee app origin (default prod: https://crow.ar). */
  readonly VITE_CLIENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
