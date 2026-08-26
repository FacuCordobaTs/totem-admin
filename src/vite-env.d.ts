/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Optional override for attendee app origin (default prod: https://crow.ar). */
  readonly VITE_CLIENT_URL?: string
  /** OAuth `client_id` — mismo número que `MP_CLIENT_ID` en backend/.env (no es secreto). */
  readonly VITE_MP_APP_ID?: string
  /** Must match MP_REDIRECT_URI on the API (e.g. https://api.crow.ar/api/mp/callback). */
  readonly VITE_MP_REDIRECT_URI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
