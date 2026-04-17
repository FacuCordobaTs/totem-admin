import { useEffect, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router"
import { useAuthStore, type StaffRole } from "@/stores/auth-store"

function redirectForRestrictedRole(
  role: StaffRole | undefined,
  pathname: string
): string | null {
  if (role === "BARTENDER") {
    if (
      pathname === "/pos" ||
      pathname === "/settings" ||
      pathname.startsWith("/settings/")
    ) {
      return null
    }
    return "/pos"
  }
  if (role === "SECURITY") {
    if (
      pathname === "/scanner" ||
      pathname === "/settings" ||
      pathname.startsWith("/settings/")
    ) {
      return null
    }
    return "/scanner"
  }
  return null
}

export function RoleAccessGate() {
  const pathname = useLocation().pathname
  const token = useAuthStore((s) => s.token)
  const staff = useAuthStore((s) => s.staff)
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    if (!token) {
      setSessionReady(true)
      return
    }
    void fetchSession().finally(() => setSessionReady(true))
  }, [token, fetchSession])

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    )
  }

  const target = redirectForRestrictedRole(staff?.role, pathname)
  if (target) {
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
