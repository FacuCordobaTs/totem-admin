import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch, getWsBase } from "@/lib/api"

export type StockSnapshot = {
  eventInventory: { inventoryItemId: string; stockAllocated: string }[]
  barInventory: {
    barId: string
    inventoryItemId: string
    currentStock: string
  }[]
}

type StockWsPayload = {
  type: "stock-update"
  eventInventory: { inventoryItemId: string; stockAllocated: string }[]
  barInventory: {
    barId: string
    inventoryItemId: string
    currentStock: string
  }[]
}

export type StockLevels = {
  event: Record<string, number>
  bar: Record<string, number>
}

function snapshotToLevels(snap: StockSnapshot): StockLevels {
  const event: Record<string, number> = {}
  const bar: Record<string, number> = {}
  for (const r of snap.eventInventory) {
    event[r.inventoryItemId] = Number.parseFloat(r.stockAllocated)
  }
  for (const r of snap.barInventory) {
    bar[`${r.barId}:${r.inventoryItemId}`] = Number.parseFloat(r.currentStock)
  }
  return { event, bar }
}

function applyDelta(prev: StockLevels, payload: StockWsPayload): StockLevels {
  const event = { ...prev.event }
  const bar = { ...prev.bar }
  for (const r of payload.eventInventory) {
    event[r.inventoryItemId] = Number.parseFloat(r.stockAllocated)
  }
  for (const r of payload.barInventory) {
    bar[`${r.barId}:${r.inventoryItemId}`] = Number.parseFloat(r.currentStock)
  }
  return { event, bar }
}

export type StockConnectionStatus = "idle" | "connecting" | "open" | "closed"

export function useEventStock(
  eventId: string | null,
  barId: string | null,
  token: string | null,
  enabled: boolean
) {
  const [levels, setLevels] = useState<StockLevels>({ event: {}, bar: {} })
  const [status, setStatus] = useState<StockConnectionStatus>("idle")
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSnapshot = useCallback(async () => {
    if (!token || !eventId) return
    const snap = await apiFetch<StockSnapshot>(
      `/events/${eventId}/stock-snapshot`,
      { method: "GET", token }
    )
    const next = snapshotToLevels(snap)
    setLevels(next)
  }, [token, eventId])

  useEffect(() => {
    if (!enabled || !eventId || !token) {
      setLevels({ event: {}, bar: {} })
      setStatus("idle")
      return
    }

    let cancelled = false
    void (async () => {
      try {
        await loadSnapshot()
      } catch {
        if (!cancelled) {
          setLevels({ event: {}, bar: {} })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, eventId, token, loadSnapshot])

  useEffect(() => {
    if (!enabled || !eventId || !token) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    const enc = encodeURIComponent(token)
    const url = `${getWsBase()}/ws/event/${eventId}/stock?token=${enc}`
    setStatus("connecting")
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus("open")
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as StockWsPayload
        if (data.type !== "stock-update") return
        setLevels((prev) => applyDelta(prev, data))
      } catch {
        /* ignore */
      }
    }

    ws.onerror = () => {
      setStatus("closed")
    }

    ws.onclose = () => {
      setStatus("closed")
      wsRef.current = null
      void loadSnapshot().catch(() => {})
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          void loadSnapshot().catch(() => {})
        }, 25_000)
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [enabled, eventId, token, loadSnapshot])

  const refreshSnapshot = useCallback(async () => {
    await loadSnapshot()
  }, [loadSnapshot])

  return {
    eventStock: levels.event,
    barStock: levels.bar,
    connectionStatus: status,
    refreshSnapshot,
    barId,
  }
}
