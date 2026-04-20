/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Optional override for attendee app origin (default prod: https://my.totem.uno). */
  readonly VITE_CLIENT_URL?: string
  /** Mercado Pago OAuth app id (same as MP_CLIENT_ID on the API). */
  readonly VITE_MP_APP_ID?: string
  /** Must match MP_REDIRECT_URI on the API (e.g. https://api.totem.uno/api/mp/callback). */
  readonly VITE_MP_REDIRECT_URI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
