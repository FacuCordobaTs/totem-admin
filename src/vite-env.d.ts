/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Optional override for attendee app origin (default prod: https://my.totem.uno). */
  readonly VITE_CLIENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
