export type RecipeLine = {
  inventoryItemId: string
  quantityUsed: string
}

/**
 * Full product units available (bottleneck). No recipes → unlimited for UI.
 */
export function productAvailabilityUnits(
  recipes: RecipeLine[],
  eventStock: Record<string, number>,
  barStock: Record<string, number>,
  barId: string
): number {
  if (recipes.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  let minU = Number.POSITIVE_INFINITY
  for (const r of recipes) {
    const q = Number.parseFloat(r.quantityUsed)
    if (!Number.isFinite(q) || q <= 0) continue
    const ev = eventStock[r.inventoryItemId] ?? 0
    const bar = barStock[`${barId}:${r.inventoryItemId}`] ?? 0
    const fromEv = Math.floor(ev / q)
    const fromBar = Math.floor(bar / q)
    const line = Math.min(fromEv, fromBar)
    minU = Math.min(minU, line)
  }

  if (!Number.isFinite(minU)) return 0
  return Math.max(0, minU)
}
