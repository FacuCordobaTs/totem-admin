import { Calendar, Package, Users, Settings, type LucideIcon } from "lucide-react"

export type GlobalNavItem = {
  name: string
  href: string
  icon: LucideIcon
}

/**
 * Navegación global del productor (spec §3.2): Eventos · Catálogo · Equipo · Cuenta.
 * Fuente única compartida por el Header (barra permanente) y el Sidebar (rail de
 * Scanner/Métricas) para que no se desincronicen. Las rutas son estables; sólo cambia
 * la etiqueta visible (Catálogo = InventoryPage, Equipo = StaffPage, Cuenta = SettingsPage).
 */
export const globalNav: GlobalNavItem[] = [
  { name: "Eventos", href: "/eventos", icon: Calendar },
  { name: "Catálogo", href: "/catalogo", icon: Package },
  { name: "Equipo", href: "/staff", icon: Users },
  { name: "Cuenta", href: "/configuracion", icon: Settings },
]

/** Marca activo el item cuya ruta coincide o es prefijo del pathname actual. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
