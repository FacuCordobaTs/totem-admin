import type { StaffRole } from "@/stores/auth-store"

const labels: Record<StaffRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  BARTENDER: "Barra",
  SECURITY: "Seguridad",
}

export function staffRoleLabel(role: StaffRole): string {
  return labels[role] ?? role
}
