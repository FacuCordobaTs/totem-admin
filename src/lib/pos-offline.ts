import { apiFetch, ApiError, getApiBase } from "./api"
import { commandsToBytes, formatReciboVentaBarra, formatTicketCanjeable, type SaleItemPrintData } from "./printerUtils"

export type PosPrintSnapshot = {
  staffName?: string
  customerName?: string | null
  hasCustomer: boolean
  hasProducts: boolean
  items: SaleItemPrintData[]
}

export type PosSaleBody = {
  eventId: string
  barId: string
  allowNegativeStock: boolean
  paymentMethod: "CASH" | "CARD" | "MERCADOPAGO" | "SALDO"
  items: { productId: string; quantity: number }[]
  balanceCharge?: string
  customerDni?: string
  customerName?: string
  promoterId?: string
  requestId: string
  expectedTotalAmount?: string
  clientSale?: {
    receiptToken: string
    createdAt: string
    lines: { productId: string; priceAtTime: string; qrHashes: string[] }[]
  }
}

export type PosSaleResponse = {
  message: string
  saleId: string
  receiptToken?: string
  totalAmount: string
  createdAt?: string
  consumptions?: { productName: string; qrHash: string }[]
}

export type PosQueuedSale = {
  id: string
  owner: string
  createdAt: string
  body: PosSaleBody
  totalAmount: string
  eventName: string
  barName: string
  documents: number[][]
  printedDocuments: number
  printStatus: "pending" | "printing" | "printed" | "failed"
  printError?: string
  syncStatus: "pending" | "synced" | "blocked"
  syncError?: string
  response?: PosSaleResponse
  printSnapshot?: PosPrintSnapshot
}

export function buildPosDocuments(sale: Pick<PosQueuedSale, "body" | "createdAt" | "eventName" | "barName">, snapshot: PosPrintSnapshot, response: PosSaleResponse, pendingSync: boolean): number[][] {
  const documents = [commandsToBytes(formatReciboVentaBarra({
    id: response.saleId, receiptToken: response.receiptToken,
    orderQrToken: snapshot.hasProducts ? response.receiptToken : null,
    totalAmount: response.totalAmount, paymentMethod: sale.body.paymentMethod,
    staffName: snapshot.staffName, customerName: snapshot.customerName,
    createdAt: response.createdAt ?? sale.createdAt, pendingSync,
  }, snapshot.items, sale.barName, sale.eventName))]
  if (snapshot.hasCustomer && response.consumptions?.length) documents.push(commandsToBytes(formatTicketCanjeable(
    response.consumptions, sale.eventName, sale.barName, snapshot.customerName,
  )))
  return documents
}

export function posOwner(tenantId: string, staffId: string): string {
  return JSON.stringify([getApiBase(), tenantId, staffId])
}

let database: Promise<IDBDatabase> | undefined
function openDb(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("crow-pos", 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore("cache", { keyPath: "key" })
        db.createObjectStore("sales", { keyPath: "id" }).createIndex("owner", "owner")
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined }
        resolve(request.result)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error("Cerrá las otras ventanas para habilitar el almacenamiento del POS"))
    }).catch((error) => { database = undefined; throw error })
  }
  return database
}

// Only resolve writes after transaction commit: a successful IDBRequest is not durable yet.
async function transaction<T>(store: string, mode: IDBTransactionMode, run: (objectStore: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode, { durability: mode === "readwrite" ? "strict" : "default" })
    let value: T
    tx.oncomplete = () => resolve(value)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar la venta en este equipo"))
    run(tx.objectStore(store), (next) => { value = next })
  })
}

const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("crow-pos-changes")
channel?.addEventListener("message", () => listeners.forEach((listener) => listener()))
function changed() { listeners.forEach((listener) => listener()); channel?.postMessage("changed") }
export function subscribePosQueue(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function enqueuePosSale(sale: PosQueuedSale): Promise<void> {
  await transaction<void>("sales", "readwrite", (store) => { store.add(sale) })
  changed()
  // This is advisory; unsupported WebViews still keep the committed IndexedDB record.
  void navigator.storage?.persist?.().catch(() => {})
}

export async function listPosSales(owner: string): Promise<PosQueuedSale[]> {
  const rows = await transaction<PosQueuedSale[]>("sales", "readonly", (store, result) => {
    const request = store.index("owner").getAll(owner)
    request.onsuccess = () => result(request.result as PosQueuedSale[])
  })
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export async function updatePosSale(id: string, patch: Partial<PosQueuedSale>): Promise<void> {
  await transaction<void>("sales", "readwrite", (store) => {
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...patch })
    }
  })
  changed()
}

export async function posCachedFetch<T>(path: string, owner: string, token: string): Promise<T> {
  const key = JSON.stringify([owner, path])
  let cached: { value: T } | undefined
  try {
    cached = await transaction("cache", "readonly", (store, result) => {
      const request = store.get(key)
      request.onsuccess = () => result(request.result)
    })
  } catch { /* online reads still work if local storage is unavailable */ }
  if (!navigator.onLine && cached) return cached.value
  try {
    const value = await apiFetch<T>(path, { token, signal: AbortSignal.timeout(3000) })
    setPosOnline(owner, true)
    await transaction<void>("cache", "readwrite", (store) => { store.put({ key, value }) }).catch(() => {})
    return value
  } catch (error) {
    const transient = !(error instanceof ApiError) || error.status >= 500 || [408, 429].includes(error.status)
    setPosOnline(owner, !transient)
    if (cached && transient) return cached.value
    throw error
  }
}

export type PosSessionIdentity = { owner: string; token: string }
export type PosSyncResult = { online: boolean; synced: number }

const connections = new Map<string, boolean>()
const synchronizing = new Map<string, Promise<PosSyncResult>>()
const networkListeners = new Set<() => void>()
export function subscribePosNetwork(listener: () => void) {
  networkListeners.add(listener)
  return () => { networkListeners.delete(listener) }
}
export function isPosOnline(owner: string | null) { return navigator.onLine && (owner ? connections.get(owner) ?? true : true) }
export function isPosSyncing(owner: string | null) { return !!owner && synchronizing.has(owner) }
export function setPosOnline(owner: string | null, online: boolean) {
  if (owner) connections.set(owner, online)
  networkListeners.forEach((listener) => listener())
}

// Web Locks serialize windows; backend idempotency also protects older WebViews without locks.
export async function syncPosSales(session: PosSessionIdentity, stillCurrent: () => boolean): Promise<PosSyncResult> {
  const existing = synchronizing.get(session.owner)
  if (existing) return existing
  const run = async (): Promise<PosSyncResult> => {
    if (!navigator.onLine) return { online: false, synced: 0 }
    let synced = 0
    let contactedServer = false
    for (const sale of await listPosSales(session.owner)) {
      if (!stillCurrent()) break
      if (sale.syncStatus !== "pending") continue
      try {
        const response = await apiFetch<PosSaleResponse>("/inventory/sales", {
          method: "POST", token: session.token, body: JSON.stringify(sale.body),
          signal: AbortSignal.timeout(8000),
        })
        contactedServer = true
        if (response.saleId !== sale.id || !response.receiptToken ||
          (sale.body.expectedTotalAmount && response.totalAmount !== sale.body.expectedTotalAmount) ||
          (sale.body.clientSale && (response.receiptToken !== sale.body.clientSale.receiptToken ||
            JSON.stringify(response.consumptions?.map((line) => line.qrHash) ?? []) !== JSON.stringify(sale.body.clientSale.lines.flatMap((line) => line.qrHashes))))) {
          // An old server may have already created a sale while ignoring requestId. Do not retry it automatically.
          throw new ApiError("El backend no confirmó los identificadores o importes del pedido. Revisá la venta en el servidor y actualizá el backend antes de reintentar; no vuelvas a cobrar.", 409, null)
        }
        await updatePosSale(sale.id, {
          syncStatus: "synced", syncError: undefined, response,
          ...(sale.printSnapshot && !sale.documents.length ? { documents: buildPosDocuments(sale, sale.printSnapshot, response, false) } : {}),
        })
        synced++
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo enviar la venta"
        if (error instanceof ApiError && error.status < 500 && ![401, 408, 429].includes(error.status)) {
          contactedServer = true
          await updatePosSale(sale.id, { syncStatus: "blocked", syncError: message })
          continue // one invalid sale must not block every subsequent sale
        }
        await updatePosSale(sale.id, { syncError: error instanceof ApiError && error.status === 401 ? "Iniciá sesión nuevamente para sincronizar" : "Esperando conexión para enviar" })
        return { online: error instanceof ApiError && error.status === 401, synced }
      }
    }
    // Without a pending request, retain the latest API reachability result.
    return { online: contactedServer || (connections.get(session.owner) ?? true), synced }
  }
  const job = (navigator.locks ? navigator.locks.request(`crow-pos-sync:${session.owner}`, run) : run())
    .then((result) => { setPosOnline(session.owner, result.online); return result })
    .finally(() => { synchronizing.delete(session.owner); networkListeners.forEach((listener) => listener()) })
  synchronizing.set(session.owner, job)
  networkListeners.forEach((listener) => listener())
  return job
}

let printing: Promise<void> = Promise.resolve()
export function printPosSale(sale: PosQueuedSale, printRaw: (bytes: number[]) => Promise<void>, reprint = false): Promise<void> {
  const run = async () => {
    const current = (await listPosSales(sale.owner)).find((row) => row.id === sale.id)
    if (!current || !current.documents.length || (!reprint && current.printStatus !== "pending")) return
    await updatePosSale(sale.id, { printStatus: "printing", printError: undefined })
    try {
      for (let index = reprint ? 0 : current.printedDocuments; index < current.documents.length; index++) {
        await printRaw(current.documents[index])
        await updatePosSale(sale.id, { printedDocuments: index + 1 })
      }
      await updatePosSale(sale.id, { printStatus: "printed" })
    } catch (error) {
      await updatePosSale(sale.id, { printStatus: "failed", printError: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
  const locked = () => navigator.locks ? navigator.locks.request("crow-pos-print", run) : run()
  const job = printing.then(locked)
  printing = job.catch(() => {})
  return job
}
