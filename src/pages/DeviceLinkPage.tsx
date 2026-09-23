import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { CheckCircle2, MonitorSmartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError, publicApiFetch } from "@/lib/api"
import { useAuthStore, type StaffRole } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"
import { homeForRole } from "@/lib/staff-home"

type DeviceLinkInfo = {
  access: "pos" | "security" | null
  status: "pending" | "approved" | "claimed" | "expired"
  expiresAt: string
}

const ACCESS_LABELS: Record<"pos" | "security", string> = {
  pos: "POS y barra",
  security: "Acceso y seguridad",
}

const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: "Administración",
  MANAGER: "Administración",
  BARTENDER: "POS y barra",
  SECURITY: "Acceso y seguridad",
  PROMOTER: "Promotor",
}

/**
 * Pantalla que abre el teléfono al escanear el QR de vinculación de equipo. Es la mitad móvil del
 * flujo: acá la persona que YA tiene sesión aprueba que la computadora entre con su cuenta.
 * No pasa por `GuestRoute` a propósito: necesita la sesión iniciada para poder aprobar.
 */
export function DeviceLinkPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const staff = useAuthStore((s) => s.staff)
  // La sesión viene del storage: hasta que hidrate, `token` es null y no se puede decidir nada.
  const [hydrated, setHydrated] = useState(false)
  const [info, setInfo] = useState<DeviceLinkInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [approving, setApproving] = useState(false)
  const [linked, setLinked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const finish = () => setHydrated(true)
    const unsub = useAuthStore.persist.onFinishHydration(finish)
    if (useAuthStore.persist.hasHydrated()) finish()
    return unsub
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (!token || !code) {
      setChecking(false)
      return
    }
    void (async () => {
      try {
        const data = await publicApiFetch<{ deviceLink: DeviceLinkInfo }>(
          `/staff/device-links/${encodeURIComponent(code)}`
        )
        setInfo(data.deviceLink)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo leer el código")
      } finally {
        setChecking(false)
      }
    })()
  }, [code, hydrated, token])

  const approve = useCallback(async () => {
    if (!token || !code) return
    setApproving(true)
    setError(null)
    try {
      await apiFetch(`/staff/device-links/${encodeURIComponent(code)}/approve`, {
        method: "POST",
        token,
        body: JSON.stringify({}),
      })
      setLinked(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo vincular la computadora")
    } finally {
      setApproving(false)
    }
  }, [code, token])

  const unusable = error !== null || (info !== null && info.status !== "pending")

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {linked ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[#FF9500]" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              Computadora vinculada
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Ya podés usar Crow en esa computadora. Podés cerrar esta pantalla.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => navigate(homeForRole(staff?.role ?? "ADMIN"), { replace: true })}
              className="w-full h-12 mt-7 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98]"
            >
              Volver a Crow
            </Button>
          </div>
        ) : hydrated && !token ? (
          <div className="text-center">
            <MonitorSmartphone className="mx-auto h-12 w-12 text-[#FF9500]" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              Iniciá sesión en este teléfono
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Para vincular la computadora hace falta tu cuenta abierta acá. Entrá y volvé a escanear
              el código.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => navigate("/login")}
              className="w-full h-12 mt-7 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98]"
            >
              Iniciar sesión
            </Button>
          </div>
        ) : checking ? (
          <p className="text-center text-sm text-muted-foreground">Consultando el código…</p>
        ) : unusable ? (
          <div className="space-y-4">
            <p
              className="rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error ??
                (info?.status === "claimed"
                  ? "Este código ya fue usado."
                  : "Este código venció.")}
            </p>
            <p className="text-center text-sm leading-relaxed text-white/50">
              Pedí uno nuevo en la computadora y volvé a escanearlo.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              ¿Vincular esta computadora?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Va a entrar con tu cuenta, como si iniciaras sesión ahí.
            </p>

            <div className="mt-7 rounded-2xl bg-white/[0.08] p-4 text-left">
              <p className="text-[15px] font-semibold text-white">{staff?.name ?? "Tu cuenta"}</p>
              <p className="mt-0.5 text-[13px] text-white/50">
                {staff ? ROLE_LABELS[staff.role] : "Personal"}
                {staff?.tenantName ? ` · ${staff.tenantName}` : ""}
              </p>
              {info?.access ? (
                <p className="mt-3 text-xs leading-relaxed text-white/40">
                  La computadora está abriendo {ACCESS_LABELS[info.access]}.
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              size="lg"
              disabled={approving}
              onClick={() => void approve()}
              className="w-full h-12 mt-4 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {approving ? "Vinculando…" : "Vincular esta computadora"}
            </Button>
            <button
              type="button"
              onClick={() => navigate(homeForRole(staff?.role ?? "ADMIN"), { replace: true })}
              className="mt-5 text-sm text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
