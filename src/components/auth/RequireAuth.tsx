import { useEffect, useState, type ReactNode } from "react"
import { Navigate } from "react-router"
import { useAuthStore } from "@/stores/auth-store"

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
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
  }, [ready, token, fetchSession])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
