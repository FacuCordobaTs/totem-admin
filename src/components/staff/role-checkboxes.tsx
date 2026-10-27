import { staffRoleLabel } from "@/lib/role-labels"
import { cn } from "@/lib/utils"
import type { StaffRole } from "@/stores/auth-store"

const STAFF_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "PROMOTER", "GENERAL_PROMOTER", "BARTENDER", "SECURITY", "TRANSPORTER"]

export function RoleCheckboxes({ roles, onChange, disabled }: { roles: StaffRole[]; onChange: (roles: StaffRole[]) => void; disabled: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-2">{STAFF_ROLES.map((role) => {
    const selected = roles.includes(role)
    return (
      <label
        key={role}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg p-3 text-sm transition-colors",
          selected
            ? "bg-[#FF9500]/10 text-white"
            : "bg-white/[0.04] text-white/70 hover:bg-white/[0.06]"
        )}
      >
        <input type="checkbox" checked={selected} disabled={disabled} className="h-4 w-4 accent-[#FF9500]" onChange={(event) => onChange(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role))} />
        {staffRoleLabel(role)}
      </label>
    )
  })}</div>
}
