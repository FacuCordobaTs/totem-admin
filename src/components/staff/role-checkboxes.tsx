import { staffRoleLabel } from "@/lib/role-labels"
import type { StaffRole } from "@/stores/auth-store"

const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "PROMOTER", "GENERAL_PROMOTER", "BARTENDER", "SECURITY", "TRANSPORTER"]

export function RoleCheckboxes({ roles, onChange, disabled }: { roles: StaffRole[]; onChange: (roles: StaffRole[]) => void; disabled: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-2">{STAFF_ROLES.map((role) => (
    <label key={role} className="flex cursor-pointer items-center gap-3 rounded-lg border border-current/15 p-3 text-sm">
      <input type="checkbox" checked={roles.includes(role)} disabled={disabled} className="h-4 w-4 accent-[#FF9500]" onChange={(event) => onChange(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role))} />
      {staffRoleLabel(role)}
    </label>
  ))}</div>
}
