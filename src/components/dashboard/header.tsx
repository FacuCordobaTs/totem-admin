import { ChevronDown, Menu } from "lucide-react"
import { Link, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { apiFetch } from "@/lib/api"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const staff = useAuthStore((s) => s.staff)
  const token = useAuthStore((s) => s.token)
  const logoutStore = useAuthStore((s) => s.logout)

  const displayName = staff?.name ?? "Usuario"
  const displayEmail = staff?.email ?? ""
  const roleLabel = staff ? staffRoleLabel(staff.role) : ""
  const isBartender = staff?.role === "BARTENDER"
  const isSecurity = staff?.role === "SECURITY"

  async function handleLogout() {
    try {
      await apiFetch("/staff/logout", { method: "POST", token })
    } catch {
      /* ignorar error de red al cerrar sesión */
    }
    logoutStore()
    navigate("/login", { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/50 bg-white/70 px-4 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 lg:h-16 lg:px-8">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl text-foreground lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-10 max-w-[min(100vw-5rem,280px)] gap-2 rounded-xl px-2 hover:bg-zinc-500/10"
          >
            <Avatar className="h-8 w-8 shrink-0 rounded-full">
              <AvatarImage src={undefined} alt="" />
              <AvatarFallback className="rounded-full bg-zinc-500/15 text-[13px] font-semibold text-foreground">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 flex-col items-start text-left md:flex">
              <span className="max-w-full truncate text-[15px] font-semibold leading-tight text-foreground">
                {displayName}
              </span>
              {roleLabel ? (
                <span className="max-w-full truncate text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                  {roleLabel}
                </span>
              ) : null}
            </div>
            <ChevronDown className="hidden h-4 w-4 shrink-0 text-[#8E8E93] md:block dark:text-[#98989D]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60 rounded-xl border-zinc-200/50 dark:border-zinc-800/50"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5 py-1">
              <p className="text-[15px] font-semibold leading-tight text-foreground">
                {displayName}
              </p>
              {roleLabel ? (
                <p className="text-[13px] text-[#8E8E93] dark:text-[#98989D]">
                  {roleLabel}
                </p>
              ) : null}
              {displayEmail ? (
                <p className="pt-2 text-[13px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                  {displayEmail}
                </p>
              ) : null}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-200/50 dark:bg-zinc-800/50" />
          <DropdownMenuItem asChild className="rounded-lg text-[15px]">
            <Link to="/settings">
              {isBartender || isSecurity ? "Mi perfil" : "Ajustes"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-200/50 dark:bg-zinc-800/50" />
          <DropdownMenuItem
            className="rounded-lg text-[15px] text-red-600 focus:text-red-600 dark:text-red-400"
            onSelect={(e) => {
              e.preventDefault()
              void handleLogout()
            }}
          >
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
