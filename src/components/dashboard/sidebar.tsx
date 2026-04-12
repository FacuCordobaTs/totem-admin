import { Link, useLocation } from "react-router"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Calendar,
  Package,
  Users,
  DollarSign,
  Settings,
  ScanLine,
  CreditCard,
} from "lucide-react"

const navigation = [
  { name: "Panel", href: "/", icon: LayoutDashboard },
  { name: "Eventos", href: "/events", icon: Calendar },
  { name: "Inventario", href: "/inventory", icon: Package },
  { name: "Personal", href: "/staff", icon: Users },
  { name: "Finanzas", href: "/finances", icon: DollarSign },
  { name: "Ajustes", href: "/settings", icon: Settings },
]

const mobileApps = [
  { name: "Control de acceso", href: "/scanner", icon: ScanLine },
  { name: "POS barra", href: "/pos", icon: CreditCard },
]

export function Sidebar() {
  const location = useLocation()
  const pathname = location.pathname

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-16 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center justify-center border-b border-border">
        <Link to="/" className="flex items-center justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">T</span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="sr-only">{item.name}</span>
              <div className="absolute left-full ml-2 hidden rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
                {item.name}
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border py-4">
        <div className="flex flex-col items-center gap-2">
          {mobileApps.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="sr-only">{item.name}</span>
                <div className="absolute left-full ml-2 hidden rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
                  {item.name}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
