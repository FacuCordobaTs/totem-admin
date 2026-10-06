import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { posOfflineShell } from './build/pos-offline-shell'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), posOfflineShell()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
