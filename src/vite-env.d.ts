/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Public client app origin (e.g. https://app.example.com) for attendee links. */
  readonly VITE_CLIENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
