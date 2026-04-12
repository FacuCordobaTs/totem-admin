import { Bell, ChevronDown, Menu } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { apiFetch } from "@/lib/api"

const events = [
  { id: "1", name: "Festival Noches Neón", date: "15 abr 2026" },
  { id: "2", name: "Gala corporativa 2026", date: "22 abr 2026" },
  { id: "3", name: "Fiesta en azotea", date: "1 may 2026" },
]

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 lg:px-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>

        <div className="hidden items-center gap-2 md:flex">
          <span className="text-sm text-muted-foreground">Evento actual:</span>
          <Select defaultValue="1">
            <SelectTrigger className="w-[220px] border-border bg-secondary">
              <SelectValue placeholder="Seleccionar evento" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  <div className="flex flex-col items-start">
                    <span>{event.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {event.date}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">Notificaciones</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex max-w-[min(100vw-8rem,280px)] items-center gap-2 px-2"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={undefined} alt="" />
                <AvatarFallback className="bg-secondary text-foreground text-xs">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 flex-col items-start md:flex">
                <span className="max-w-full truncate text-sm font-medium">
                  {displayName}
                </span>
                <span className="max-w-full truncate text-xs text-muted-foreground">
                  {displayEmail || roleLabel}
                </span>
              </div>
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {displayEmail}
                </p>
                {roleLabel ? (
                  <p className="pt-1 text-xs text-muted-foreground">{roleLabel}</p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">Perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">Ajustes</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/staff">Equipo</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                void handleLogout()
              }}
            >
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
