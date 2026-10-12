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
      pathname.startsWith("/pos/") ||
      pathname === "/configuracion" ||
      pathname.startsWith("/configuracion/")
    ) {
      return null
    }
    return "/pos"
  }
  if (role === "SECURITY" || role === "TRANSPORTER") {
    const scanner = role === "TRANSPORTER" ? "/scanner-transporte" : "/scanner"
    if (
      pathname === scanner ||
      pathname === "/configuracion" ||
      pathname.startsWith("/configuracion/")
    ) {
      return null
    }
    return scanner
  }
  if (role === "PROMOTER") {
    return pathname === "/promotor" ? null : "/promotor"
  }
  if (role === "GENERAL_PROMOTER") {
    // Su superficie son los eventos donde está asignado (y adentro, sus promotores); el resto de
    // la navegación de la productora le queda fuera.
    if (
      pathname === "/eventos" ||
      pathname.startsWith("/eventos/") ||
      pathname === "/configuracion" ||
      pathname.startsWith("/configuracion/")
    ) {
      return null
    }
    return "/eventos"
  }
  return null
}

export function RoleAccessGate() {
  const pathname = useLocation().pathname
  const token = useAuthStore((s) => s.token)
  const staff = useAuthStore((s) => s.staff)
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const [readyToken, setReadyToken] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void fetchSession().finally(() => setReadyToken(token))
  }, [token, fetchSession])

  if (token && readyToken !== token) {
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
