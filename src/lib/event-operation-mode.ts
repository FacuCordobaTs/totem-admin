import type { EventOperationMode } from "@/types/events"

export type EventOperationModeOption = {
  value: EventOperationMode
  label: string
  shortLabel: string
  description: string
}

export const EVENT_OPERATION_MODE_OPTIONS: EventOperationModeOption[] = [
  {
    value: "TICKETS_ONLY",
    label: "Venta de entradas",
    shortLabel: "Solo entradas",
    description: "Publicá entradas, gestioná el acceso y trabajá con promotores.",
  },
  {
    value: "TICKETS_AND_CONSUMPTIONS",
    label: "Entradas y consumos",
    shortLabel: "Entradas + consumos",
    description: "Sumá un menú de consumos y puntos de venta, sin controlar inventario.",
  },
  {
    value: "FULL_OPERATION",
    label: "Operación completa",
    shortLabel: "Gestión integral",
    description: "Gestioná entradas, consumos, barras, recetas, compras y stock.",
  },
]

export function eventOperationModeLabel(mode: EventOperationMode): string {
  return EVENT_OPERATION_MODE_OPTIONS.find((option) => option.value === mode)?.shortLabel
    ?? "Gestión integral"
}

export function eventSupportsConsumptions(mode: EventOperationMode): boolean {
  return mode !== "TICKETS_ONLY"
}

export function eventTracksStock(mode: EventOperationMode): boolean {
  return mode === "FULL_OPERATION"
}
