import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { accessPinPrompt, apiFetch, ApiError, type AccessPinPrompt } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"
import { ACCESS_PIN_REVOKED_NOTICE, StaffAccessPinForm } from "@/components/auth/staff-access-pin-form"
import { homeForRole } from "@/lib/staff-home"

type AcceptResponse = {
  message: string
  token: string
  staff: StaffProfile
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const forgetAccessLink = useAuthStore((s) => s.forgetAccessLink)
  const rememberedLink = useAuthStore((s) => s.accessLinkToken)
  const sessionNotice = useAuthStore((s) => s.sessionNotice)
  const [error, setError] = useState<string | null>(null)
  const [pinPrompt, setPinPrompt] = useState<AccessPinPrompt | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const acceptedTokenRef = useRef<string | null>(null)

  const accept = useCallback(
    async (pin?: string) => {
      if (!token) return
      setSubmitting(true)
      try {
        const data = await apiFetch<AcceptResponse>(`/staff/invitations/${token}/accept`, {
          method: "POST",
          body: JSON.stringify(pin ? { pin } : {}),
        })
        // El dispositivo recuerda el link: si la sesión se cierra sola, vuelve acá y no al login.
        setAuth(data.token, data.staff, { accessLinkToken: token })
        navigate(homeForRole(data.staff.role), { replace: true })
      } catch (err) {
        const prompt = accessPinPrompt(err)
        if (prompt) {
          setPinPrompt(prompt)
          // El primer pedido (sin PIN) no es un error: sólo abre el paso del PIN.
          setPinError(pin ? (err as ApiError).message : null)
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión")
        }
      } finally {
        setSubmitting(false)
      }
    },
    [navigate, setAuth, token]
  )

  useEffect(() => {
    if (!token || acceptedTokenRef.current === token) return
    acceptedTokenRef.current = token
    void accept()
  }, [accept, token])

  // Llegó solo (sesión cerrada en este dispositivo): quien lo tiene en la mano puede no ser esa
  // persona, así que se ofrece salir a otra cuenta.
  const reachedFromDevice = rememberedLink === token

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {error ? (
          <div className="space-y-6 text-center">
            <p className="rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
              {error}
            </p>
            {/* Un link revocado o dado de baja no puede dejar al dispositivo dando vueltas acá. */}
            <button
              type="button"
              onClick={() => {
                if (reachedFromDevice) forgetAccessLink()
                navigate("/login", { replace: true })
              }}
              className="text-sm text-white/50 transition-colors hover:text-white"
            >
              Ir al inicio de sesión
            </button>
          </div>
        ) : pinPrompt ? (
          <StaffAccessPinForm
            name={pinPrompt.name}
            tenantName={pinPrompt.tenantName}
            notice={sessionNotice === "access-pin" && reachedFromDevice ? ACCESS_PIN_REVOKED_NOTICE : null}
            error={pinError}
            submitting={submitting}
            onSubmit={(pin) => void accept(pin)}
            footer={
              reachedFromDevice ? (
                <button
                  type="button"
                  onClick={() => {
                    forgetAccessLink()
                    navigate("/login", { replace: true })
                  }}
                  className="text-sm text-white/50 transition-colors hover:text-white"
                >
                  {pinPrompt.name ? `No soy ${pinPrompt.name}` : "Entrar con otra cuenta"}
                </button>
              ) : null
            }
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground">Abriendo tu acceso…</p>
        )}
      </div>
    </div>
  )
}
