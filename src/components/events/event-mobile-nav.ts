import { createContext, useContext, useEffect, useMemo } from "react"

export type NestedViewRegistry = {
  setId: (id: symbol, open: boolean) => void
  nestedCount: number
}

export const EventMobileNavContext = createContext<NestedViewRegistry | null>(
  null
)

export function useEventNestedActive(): boolean {
  const registry = useContext(EventMobileNavContext)
  return (registry?.nestedCount ?? 0) > 0
}

/**
 * Registra una vista anidada (detalle, editor, venta) para que el encabezado mobile
 * no muestre su botón de volver al mismo tiempo que el botón interno de esa vista.
 * Fuera de un `EventLayout` no hace nada.
 */
export function useEventNestedView(open: boolean) {
  const registry = useContext(EventMobileNavContext)
  const id = useMemo(() => Symbol("event-nested-view"), [])

  useEffect(() => {
    if (!registry) return
    registry.setId(id, open)
    return () => registry.setId(id, false)
  }, [id, open, registry])
}
