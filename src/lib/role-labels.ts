import type { StaffRole } from "@/stores/auth-store"

const labels: Record<StaffRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  BARTENDER: "Barra",
  SECURITY: "Seguridad",
  PROMOTER: "Promotor",
  GENERAL_PROMOTER: "Promotor general",
}

export function staffRoleLabel(role: StaffRole): string {
  return labels[role] ?? role
}
