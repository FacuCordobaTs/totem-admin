import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { indexedDB } from "fake-indexeddb"
import { enqueuePosSale, isPosOnline, isPosSyncing, listPosSales, posCachedFetch, posOwner, printPosSale, syncPosSales, updatePosSale, type PosQueuedSale } from "../src/lib/pos-offline"

Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true })
const originalFetch = globalThis.fetch
let owner: string
function online(value: boolean) { Object.defineProperty(navigator, "onLine", { value, configurable: true }) }
const sale = (overrides: Partial<PosQueuedSale> = {}): PosQueuedSale => {
  const id = crypto.randomUUID()
  return {
    id, owner, createdAt: new Date().toISOString(), totalAmount: "0.30", eventName: "Evento", barName: "Barra",
    body: {
      requestId: id, eventId: "event-1", barId: "bar-1", allowNegativeStock: true, paymentMethod: "CASH",
      items: [{ productId: "product-1", quantity: 3 }],
      clientSale: { receiptToken: crypto.randomUUID(), createdAt: new Date().toISOString(), lines: [{ productId: "product-1", priceAtTime: "0.10", qrHashes: Array.from({ length: 3 }, () => crypto.randomUUID()) }] },
    },
    documents: [[1, 2], [3, 4]], printedDocuments: 0, printStatus: "pending", syncStatus: "pending", ...overrides,
  }
}
const response = (row: PosQueuedSale) => new Response(JSON.stringify({ message: "Venta registrada", saleId: row.id, totalAmount: row.totalAmount, receiptToken: row.body.clientSale?.receiptToken, consumptions: row.body.clientSale?.lines.flatMap((line) => line.qrHashes.map((qrHash) => ({ productName: "Agua", qrHash }))) }), { status: 201 })
const sync = () => syncPosSales({ owner, token: "test-token" }, () => true)
beforeEach(() => { owner = posOwner("tenant-1", crypto.randomUUID()); online(true) })
afterEach(() => { globalThis.fetch = originalFetch })

describe("POS: almacenamiento e impresión independientes de la red", () => {
  test("una petición lenta no retiene la impresión y comparte su estado de conexión", async () => {
    const row = sale()
    await enqueuePosSale(row)
    let release!: (value: Response) => void
    globalThis.fetch = mock(() => new Promise<Response>((resolve) => { release = resolve })) as typeof globalThis.fetch
    const sending = sync()
    expect(isPosSyncing(owner)).toBe(true)
    const print = mock(async () => {})
    await printPosSale(row, print)
    expect((await listPosSales(owner))[0]).toMatchObject({ printStatus: "printed", syncStatus: "pending" })
    release(response(row))
    await sending
    expect(isPosSyncing(owner)).toBe(false)
    expect(isPosOnline(owner)).toBe(true)
  })
  test("los pedidos se recuperan al abrir otra instancia de la aplicación", async () => {
    const row = sale()
    await enqueuePosSale(row)
    // A new module opens a new DB connection, with no in-memory queue from this instance.
    const reopened = await import("../src/lib/pos-offline?reopened")
    expect((await reopened.listPosSales(owner))[0]).toEqual(row)
  })
  test("una sesión que cambió antes del envío conserva la cola sin enviar", async () => {
    await enqueuePosSale(sale())
    const fetch = mock(async () => new Response("{}"))
    globalThis.fetch = fetch as typeof globalThis.fetch
    await syncPosSales({ owner, token: "old-token" }, () => false)
    expect(fetch).not.toHaveBeenCalled()
    expect((await listPosSales(owner))[0].syncStatus).toBe("pending")
  })
  test("saldo no emite documentos hasta que el servidor confirma el débito", async () => {
    const row = sale({ documents: [], printSnapshot: {
      staffName: "Caja", hasCustomer: true, hasProducts: true, customerName: "Cliente",
      items: [{ name: "Agua", quantity: 3, priceAtTime: "0.10" }],
    } })
    row.body.paymentMethod = "SALDO"
    row.body.customerDni = "12345678"
    delete row.body.clientSale
    await enqueuePosSale(row)
    const print = mock(async () => {})
    await printPosSale(row, print)
    expect(print).not.toHaveBeenCalled()
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      message: "Venta registrada", saleId: row.id, totalAmount: "0.30", receiptToken: crypto.randomUUID(),
      consumptions: [{ productName: "Agua", qrHash: crypto.randomUUID() }],
    }))) as typeof globalThis.fetch
    await sync()
    expect((await listPosSales(owner))[0].documents).toHaveLength(2)
    await printPosSale(row, print)
    expect(print).toHaveBeenCalledTimes(2)
  })
  test("sin internet guarda y entrega los dos documentos sin esperar al servidor", async () => {
    online(false)
    const fetch = mock(() => { throw new Error("offline") })
    globalThis.fetch = fetch as typeof globalThis.fetch
    const row = sale()
    await enqueuePosSale(row)
    const print = mock(async () => {})
    await printPosSale(row, print)
    expect(print.mock.calls).toEqual([[[1, 2]], [[3, 4]]])
    expect((await listPosSales(owner))[0]).toMatchObject({ printStatus: "printed", syncStatus: "pending" })
    await sync()
    expect(fetch).not.toHaveBeenCalled()
  })
  test("si se pierde la respuesta reenvía exactamente el mismo identificador y QR", async () => {
    const row = sale()
    await enqueuePosSale(row)
    const bodies: string[] = []
    let attempts = 0
    globalThis.fetch = mock(async (_url, options) => {
      bodies.push(options?.body as string)
      if (++attempts === 1) throw new TypeError("response lost")
      return response(row)
    }) as typeof globalThis.fetch
    expect((await sync()).online).toBe(false)
    expect((await listPosSales(owner))[0].syncStatus).toBe("pending")
    expect((await sync()).synced).toBe(1)
    expect(bodies[0]).toBe(bodies[1])
    expect((await listPosSales(owner))[0]).toMatchObject({ syncStatus: "synced", response: { saleId: row.id } })
  })
  test("una venta rechazada permanece visible y no bloquea la siguiente", async () => {
    const invalid = sale({ createdAt: "2026-01-01T00:00:00Z" })
    const valid = sale({ createdAt: "2026-01-02T00:00:00Z" })
    await enqueuePosSale(invalid); await enqueuePosSale(valid)
    globalThis.fetch = mock(async (_url, options) => JSON.parse(options?.body as string).requestId === invalid.id
      ? new Response(JSON.stringify({ error: "Precio cambiado" }), { status: 409 }) : response(valid)) as typeof globalThis.fetch
    expect((await sync()).synced).toBe(1)
    expect(await listPosSales(owner)).toMatchObject([{ syncStatus: "blocked", syncError: "Precio cambiado" }, { syncStatus: "synced" }])
  })
  test("401 conserva el pedido para iniciar sesión de nuevo", async () => {
    await enqueuePosSale(sale())
    globalThis.fetch = mock(async () => new Response("{}", { status: 401 })) as typeof globalThis.fetch
    await sync()
    expect((await listPosSales(owner))[0]).toMatchObject({ syncStatus: "pending", syncError: "Iniciá sesión nuevamente para sincronizar" })
  })
  test("un backend antiguo que ignora el identificador detiene reintentos automáticos", async () => {
    await enqueuePosSale(sale())
    const fetch = mock(async () => new Response(JSON.stringify({ saleId: crypto.randomUUID(), receiptToken: crypto.randomUUID(), totalAmount: "0.30" }), { status: 201 }))
    globalThis.fetch = fetch as typeof globalThis.fetch
    await sync(); await sync()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await listPosSales(owner))[0].syncStatus).toBe("blocked")
  })
  test("cada cuenta y tenant sólo envían sus propias ventas", async () => {
    const own = sale()
    const foreign = sale({ owner: posOwner("tenant-2", "other-staff") })
    await enqueuePosSale(own); await enqueuePosSale(foreign)
    const fetch = mock(async () => response(own))
    globalThis.fetch = fetch as typeof globalThis.fetch
    await sync()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await listPosSales(foreign.owner))[0].syncStatus).toBe("pending")
  })
  test("la sincronización y la impresión no sobrescriben el estado de la otra", async () => {
    const row = sale()
    await enqueuePosSale(row)
    await Promise.all([updatePosSale(row.id, { syncStatus: "synced" }), updatePosSale(row.id, { printStatus: "printed" })])
    expect((await listPosSales(owner))[0]).toMatchObject({ syncStatus: "synced", printStatus: "printed" })
  })
  test("los disparadores simultáneos de impresión no duplican tickets", async () => {
    const row = sale()
    await enqueuePosSale(row)
    const print = mock(async () => {})
    await Promise.all([printPosSale(row, print), printPosSale(row, print)])
    expect(print).toHaveBeenCalledTimes(2) // two documents, once each
    await printPosSale(row, print)
    expect(print).toHaveBeenCalledTimes(2)
  })
  test("una impresora fallida conserva documentos e identificadores para reimprimir", async () => {
    const row = sale()
    await enqueuePosSale(row)
    await expect(printPosSale(row, async () => { throw new Error("sin papel") })).rejects.toThrow("sin papel")
    expect((await listPosSales(owner))[0]).toMatchObject({ printStatus: "failed", syncStatus: "pending", documents: row.documents })
    const print = mock(async () => {})
    await printPosSale(row, print, true)
    expect((await listPosSales(owner))[0].printStatus).toBe("printed")
  })
  test("una impresión iniciada antes del reinicio exige reimpresión explícita", async () => {
    const row = sale({ printStatus: "printing" })
    await enqueuePosSale(row)
    const print = mock(async () => {})
    await printPosSale(row, print)
    expect(print).not.toHaveBeenCalled()
    await printPosSale(row, print, true)
    expect(print).toHaveBeenCalledTimes(2)
  })
  test("el catálogo persiste offline, pero un 403 nunca usa el caché", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ products: ["Agua"] }))) as typeof globalThis.fetch
    expect(await posCachedFetch("/catalog", owner, "token")).toEqual({ products: ["Agua"] })
    online(false)
    expect(await posCachedFetch("/catalog", owner, "token")).toEqual({ products: ["Agua"] })
    online(true)
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 })) as typeof globalThis.fetch
    await expect(posCachedFetch("/catalog", owner, "token")).rejects.toThrow("No autorizado")
  })
})
