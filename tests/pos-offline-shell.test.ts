import { describe, expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { posOfflineShell } from "../build/pos-offline-shell"

function worker() {
  let source = ""
  const plugin = posOfflineShell()
  const hook = plugin.generateBundle
  const generate = typeof hook === "function" ? hook : hook?.handler
  if (!generate) throw new Error("Missing build hook")
  generate.call({ emitFile: (asset: { source: string }) => { source = asset.source } }, {}, { "assets/app-version.js": {} }, false)
  const callbacks: Record<string, (event: object) => void> = {}
  const cached = new Map<string, Response>()
  const cache = {
    addAll: async (requests: Request[]) => { for (const request of requests) cached.set(request.url, new Response("cached " + request.url)) },
    match: async (request: string | { url: string }) => cached.get(typeof request === "string" ? request : request.url)?.clone(),
  }
  runInNewContext(source, {
    URL, Request, Response, AbortSignal, Promise,
    self: { registration: { scope: "https://pos.test/" }, clients: { claim: async () => {} }, addEventListener: (name: string, cb: (event: object) => void) => { callbacks[name] = cb } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => { throw new TypeError("offline") },
  })
  return { callbacks, cached }
}

describe("Shell de producción del POS", () => {
  test("precachea index.html y los assets necesarios para reabrir sin conexión", async () => {
    const { callbacks, cached } = worker()
    let installed!: Promise<unknown>
    callbacks.install({ waitUntil: (promise: Promise<unknown>) => { installed = promise } })
    await installed
    expect(cached.has("https://pos.test/index.html")).toBe(true)
    expect(cached.has("https://pos.test/assets/app-version.js")).toBe(true)
    expect(cached.has("https://pos.test/logo.png")).toBe(true)
    let offline!: Promise<Response>
    callbacks.fetch({ request: { url: "https://pos.test/pos/venta", mode: "navigate", method: "GET" }, respondWith: (promise: Promise<Response>) => { offline = promise } })
    expect(await (await offline).text()).toBe("cached https://pos.test/index.html")
  })
  test("no intercepta APIs ni POSTs", () => {
    const { callbacks } = worker()
    let intercepted = false
    const respondWith = () => { intercepted = true }
    callbacks.fetch({ request: { url: "https://pos.test/inventory/sales", mode: "cors", method: "POST" }, respondWith })
    callbacks.fetch({ request: { url: "https://pos.test/events", mode: "cors", method: "GET" }, respondWith })
    callbacks.fetch({ request: { url: "https://api.test/events", mode: "cors", method: "GET" }, respondWith })
    expect(intercepted).toBe(false)
  })
})
