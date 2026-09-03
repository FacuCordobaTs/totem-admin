import { Link, useLocation } from "react-router"
import { cn } from "@/lib/utils"
import { globalNav, isNavItemActive } from "@/components/dashboard/global-nav"
import { useAuthStore } from "@/stores/auth-store"

export function Header() {
  const pathname = useLocation().pathname
  const staff = useAuthStore((s) => s.staff)
  // Barra global permanente sólo para el productor; barra/puerta se rutean a POS/escáner.
  const showGlobalNav = staff?.role === "ADMIN" || staff?.role === "MANAGER"

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200/50 bg-white/70 px-4 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 lg:px-8">
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        <Link
          to="/eventos"
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-opacity active:opacity-70"
          aria-label="Eventos"
        >
          <img src="/logo.png" alt="Crow" className="h-full w-full object-cover" />
        </Link>

        {showGlobalNav ? (
          <nav className="flex items-center gap-0.5 overflow-x-auto">
            {globalNav.map((item) => {
              const active = isNavItemActive(item.href, pathname)
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors active:opacity-70",
                    active
                      ? "bg-zinc-500/10 text-foreground"
                      : "text-[#8E8E93] hover:bg-zinc-500/5 hover:text-foreground dark:text-[#98989D]"
                  )}
                >
                  {item.name}
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>

    </header>
  )
}
