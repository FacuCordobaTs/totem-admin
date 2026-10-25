import { Calendar, Settings, type LucideIcon } from "lucide-react"

export type GlobalNavItem = {
  name: string
  href: string
  icon: LucideIcon
}

/**
 * Navegación global del productor: Eventos · Cuenta.
 * Fuente única compartida por el Header (barra permanente) y el Sidebar (rail de
 * Scanner/Métricas) para que no se desincronicen.
 */
export const globalNav: GlobalNavItem[] = [
  { name: "Eventos", href: "/eventos", icon: Calendar },
  { name: "Cuenta", href: "/configuracion", icon: Settings },
]

/** Marca activo el item cuya ruta coincide o es prefijo del pathname actual. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
