import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { isPosOnline, isPosSyncing, listPosSales, posOwner, setPosOnline, subscribePosNetwork, subscribePosQueue, syncPosSales, type PosQueuedSale } from "@/lib/pos-offline"

export function usePosOffline() {
  const token = useAuthStore((s) => s.token)
  const staff = useAuthStore((s) => s.staff)
  const owner = staff?.tenantId ? posOwner(staff.tenantId, staff.id) : null
  const [queue, setQueue] = useState<{ owner: string; sales: PosQueuedSale[] } | null>(null)
  const online = useSyncExternalStore(subscribePosNetwork, () => isPosOnline(owner))
  const syncing = useSyncExternalStore(subscribePosNetwork, () => isPosSyncing(owner))
  const [storageError, setStorageError] = useState<string | null>(null)

  useEffect(() => {
    if (!owner) return
    let active = true
    const refresh = () => {
      void listPosSales(owner).then((sales) => {
        if (active) { setQueue({ owner, sales }); setStorageError(null) }
      }).catch(() => { if (active) setStorageError("No se puede acceder a IndexedDB. No cobres hasta habilitar el almacenamiento local.") })
    }
    refresh()
    const unsubscribe = subscribePosQueue(refresh)
    return () => { active = false; unsubscribe() }
  }, [owner])

  const sync = useCallback(async () => {
    if (!owner || !token) return
    const stillCurrent = () => {
      const current = useAuthStore.getState()
      return current.token === token && !!current.staff?.tenantId && posOwner(current.staff.tenantId, current.staff.id) === owner
    }
    try {
      await syncPosSales({ owner, token }, stillCurrent)
    } catch { /* queue read errors are surfaced by the subscription */ }
  }, [owner, token])

  useEffect(() => {
    const connected = () => { setPosOnline(owner, true); void sync() }
    const disconnected = () => setPosOnline(owner, false)
    window.addEventListener("online", connected)
    window.addEventListener("offline", disconnected)
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected) }
  }, [sync, owner])

  return { owner, sales: queue?.owner === owner ? queue.sales : [], online, syncing, storageError, sync }
}
