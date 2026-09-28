import { EventsListPage } from "@/pages/EventsListPage"
import { EventDashboardPage } from "@/pages/EventDashboardPage"
import { GeneralPromoterEventsPage } from "@/pages/GeneralPromoterEventsPage"
import { GeneralPromoterEventPage } from "@/pages/GeneralPromoterEventPage"
import { useAuthStore } from "@/stores/auth-store"

/**
 * El promotor general entra por los mismos paths que el productor (`/eventos`, `/eventos/:id`)
 * pero ve su propia versión: los eventos donde está incluido y, adentro, sólo sus promotores.
 * `RoleAccessGate` le cierra el resto de la navegación.
 */
export function EventsRoute() {
  const role = useAuthStore((s) => s.staff?.role)
  return role === "GENERAL_PROMOTER" ? <GeneralPromoterEventsPage /> : <EventsListPage />
}

export function EventRoute() {
  const role = useAuthStore((s) => s.staff?.role)
  return role === "GENERAL_PROMOTER" ? <GeneralPromoterEventPage /> : <EventDashboardPage />
}
