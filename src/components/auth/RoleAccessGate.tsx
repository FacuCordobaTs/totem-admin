import { useEffect, useState } from "react"
import { Navigate, Outlet, useLocation, useNavigate } from "react-router"
import { useAuthStore, type StaffRole } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "./logout-button"
import { homeForRole } from "@/lib/staff-home"

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
  const roleChosen = useAuthStore((s) => s.roleChosen)
  const chooseRole = useAuthStore((s) => s.chooseRole)
  const showRolePicker = useAuthStore((s) => s.showRolePicker)
  const navigate = useNavigate()
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyToken, setReadyToken] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void fetchSession().finally(() => { if (!cancelled) setReadyToken(token) })
    return () => { cancelled = true }
  }, [token, fetchSession])

  if (token && readyToken !== token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    )
  }

  const roles = staff?.roles ?? (staff ? [staff.role] : [])
  if (roles.length > 1 && !roleChosen) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-5">
        <div className="w-full max-w-lg space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">{staff?.name} · {staff?.tenantName}</p>
            <h1 className="mt-2 text-2xl font-semibold">¿A qué querés acceder?</h1>
            <p className="mt-2 text-muted-foreground">Elegí una función. Podés cambiarla desde el botón Cambiar función.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((role) => (
              <Button key={role} variant="outline" disabled={choosing} className="h-auto min-h-16 whitespace-normal p-4 text-base" onClick={async () => {
                setChoosing(true)
                setError(null)
                try {
                  await chooseRole(role)
                  navigate(homeForRole(role), { replace: true })
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo cambiar de función.")
                  await fetchSession()
                } finally { setChoosing(false) }
              }}>{staffRoleLabel(role)}</Button>
            ))}
          </div>
          {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
          <LogoutButton />
        </div>
      </main>
    )
  }

  const target = redirectForRestrictedRole(staff?.role, pathname)
  if (target) {
    return <Navigate to={target} replace />
  }

  return <>
    {roles.length > 1 ? <div className="flex items-center justify-end gap-3 border-b bg-background px-4 py-2">
      <span className="text-sm text-muted-foreground">{staffRoleLabel(staff!.role)}</span>
      <Button size="sm" variant="outline" onClick={showRolePicker}>Cambiar función</Button>
    </div> : null}
    <Outlet key={staff?.role} />
  </>
}
