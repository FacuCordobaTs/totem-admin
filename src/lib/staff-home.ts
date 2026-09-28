import type { StaffRole } from "@/stores/auth-store"

/**
 * Pantalla inicial de cada rol tras iniciar sesión. Es la misma navegación que termina aplicando
 * `RoleAccessGate`, y la comparten todos los caminos que entregan una sesión: login, invitación,
 * magic link y vinculación de equipo.
 */
export function homeForRole(role: StaffRole): string {
  if (role === "BARTENDER") return "/pos"
  if (role === "SECURITY") return "/scanner"
  if (role === "PROMOTER") return "/promotor"
  // El promotor general trabaja dentro del evento: su lista de eventos es su pantalla inicial.
  if (role === "GENERAL_PROMOTER") return "/eventos"
  return "/"
}
