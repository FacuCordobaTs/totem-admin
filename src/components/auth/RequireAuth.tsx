import { useEffect, useState, type ReactNode } from "react"
import { Navigate } from "react-router"
import { staffReentryPath, useAuthStore } from "@/stores/auth-store"

/**
 * Cada cuánto se revalida la sesión con la pantalla abierta. Cualquier petición ya cierra una sesión
 * revocada (PIN de acceso del equipo, cuenta dada de baja), pero una pantalla quieta —un escáner
 * esperando, un POS sin ventas— también tiene que enterarse.
 */
const SESSION_CHECK_MS = 60_000

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const accessLinkToken = useAuthStore((s) => s.accessLinkToken)
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const finish = () => setReady(true)
    const unsub = useAuthStore.persist.onFinishHydration(finish)
    if (useAuthStore.persist.hasHydrated()) finish()
    return unsub
  }, [])

  useEffect(() => {
    if (!ready || !token) return
    void fetchSession()
    const check = () => {
      if (document.visibilityState === "visible") void fetchSession()
    }
    const interval = window.setInterval(check, SESSION_CHECK_MS)
    document.addEventListener("visibilitychange", check)
    window.addEventListener("focus", check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", check)
      window.removeEventListener("focus", check)
    }
  }, [ready, token, fetchSession])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    )
  }

  if (!token) {
    return <Navigate to={staffReentryPath({ accessLinkToken })} replace />
  }

  return <>{children}</>
}
