import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { posOfflineShell } from './build/pos-offline-shell'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), posOfflineShell()],
  // El lector de QR corre zxing-wasm en un Worker (`src/lib/zxing-worker.ts`); en formato ES
  // comparte el import del `.wasm?url` igual que el hilo principal.
  worker: { format: "es" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
