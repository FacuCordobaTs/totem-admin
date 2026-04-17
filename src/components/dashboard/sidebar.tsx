import { Link, useLocation } from "react-router"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Calendar,
  Package,
  Users,
  ScanLine,
  CreditCard,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

const adminNavigation = [
  { name: "Inicio", href: "/", icon: LayoutDashboard },
  { name: "Eventos", href: "/events", icon: Calendar },
  { name: "Inventario", href: "/inventory", icon: Package },
  { name: "Personal", href: "/staff", icon: Users },
]

const bartenderNavigation = [{ name: "Punto de Venta", href: "/pos", icon: CreditCard }]

const securityNavigation = [
  { name: "Escáner / Control de Acceso", href: "/scanner", icon: ScanLine },
]

const mobileApps = [
  { name: "Control de acceso", href: "/scanner", icon: ScanLine },
  { name: "POS barra", href: "/pos", icon: CreditCard },
]

export function Sidebar() {
  const location = useLocation()
  const pathname = location.pathname
  const role = useAuthStore((s) => s.staff?.role)
  const isBartender = role === "BARTENDER"
  const isSecurity = role === "SECURITY"

  const navigation =
    role === "BARTENDER"
      ? bartenderNavigation
      : role === "SECURITY"
        ? securityNavigation
        : adminNavigation
  const homeHref =
    role === "BARTENDER" ? "/pos" : role === "SECURITY" ? "/scanner" : "/"

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[4.25rem] flex-col border-r border-zinc-200/50 bg-white/80 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/80 lg:flex">
      <div className="flex h-16 items-center justify-center border-b border-zinc-200/50 dark:border-zinc-800/50">
        <Link
          to={homeHref}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[17px] font-bold text-[#FF9500] transition-opacity active:opacity-70"
          aria-label="Inicio"
        >
          T
        </Link>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1.5 py-5">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors active:opacity-70",
                isActive
                  ? "bg-zinc-100 text-foreground dark:bg-zinc-800 dark:text-white"
                  : "text-[#8E8E93] hover:bg-zinc-100/80 hover:text-foreground dark:text-[#98989D] dark:hover:bg-zinc-800/50"
              )}
            >
              <item.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
              <span className="sr-only">{item.name}</span>
              <div className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg border border-zinc-200/50 bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-foreground backdrop-blur-xl group-hover:block dark:border-zinc-800/50 dark:bg-[#1C1C1E]/95">
                {item.name}
              </div>
            </Link>
          )
        })}
      </nav>

      {!isBartender && !isSecurity ? (
        <div className="border-t border-zinc-200/50 py-4 dark:border-zinc-800/50">
          <div className="flex flex-col items-center gap-1.5">
            {mobileApps.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors active:opacity-70",
                    isActive
                      ? "bg-zinc-100 text-foreground dark:bg-zinc-800 dark:text-white"
                      : "text-[#8E8E93] hover:bg-zinc-100/80 hover:text-foreground dark:text-[#98989D] dark:hover:bg-zinc-800/50"
                  )}
                >
                  <item.icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
                  <span className="sr-only">{item.name}</span>
                  <div className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg border border-zinc-200/50 bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-foreground backdrop-blur-xl group-hover:block dark:border-zinc-800/50 dark:bg-[#1C1C1E]/95">
                    {item.name}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}
    </aside>
  )
}
