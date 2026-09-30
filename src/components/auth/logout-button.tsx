import { useState } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"

const LABEL = "Cerrar sesión"

/** Tope de espera al backend: cerrar sesión no puede quedar colgado por la red del evento. */
const LOGOUT_REQUEST_TIMEOUT_MS = 4000

const VARIANT_CLASS = {
  outline:
    "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30",
  ghost: "text-[#8E8E93] hover:text-foreground dark:text-[#98989D]",
} as const

type LogoutButtonProps = {
  /** `outline` es el botón rojo de acción; `ghost`, uno discreto para cabeceras. */
  variant?: keyof typeof VARIANT_CLASS
  /** Sólo el ícono (la etiqueta pasa a `aria-label`), para barras angostas. */
  iconOnly?: boolean
  /** Corre justo antes de vaciar la sesión, p. ej. para que el POS olvide el puesto fijado. */
  onBeforeLogout?: () => void
  className?: string
}

/**
 * Cerrar sesión con confirmación. Es el único botón de salida para las pantallas del personal que
 * no tienen la navegación de la productora (POS, scanner, promotores): el admin sale desde Cuenta.
 */
export function LogoutButton({
  variant = "outline",
  iconOnly = false,
  onBeforeLogout,
  className,
}: LogoutButtonProps) {
  const token = useAuthStore((s) => s.token)
  const clearSession = useAuthStore((s) => s.logout)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  async function confirmLogout() {
    setClosing(true)
    // La API autentica por `Authorization` y este endpoint sólo limpia una cookie: el cierre real es
    // vaciar la sesión local, así que el aviso al servidor es de cortesía y no puede trabarlo.
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), LOGOUT_REQUEST_TIMEOUT_MS)
    try {
      await apiFetch("/staff/logout", { method: "POST", token, signal: controller.signal })
    } catch {
      /* sin red o sin respuesta a tiempo: se cierra igual */
    } finally {
      window.clearTimeout(timeout)
    }
    onBeforeLogout?.()
    clearSession()
    // Navegación completa a propósito: descarta el estado en memoria de la cuenta que sale.
    window.location.assign("/login")
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!closing) setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={iconOnly ? "icon" : "default"}
          aria-label={iconOnly ? LABEL : undefined}
          title={iconOnly ? LABEL : undefined}
          className={cn("gap-2", VARIANT_CLASS[variant], className)}
        >
          <LogOut />
          {iconOnly ? null : LABEL}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            Vas a salir de tu cuenta en este dispositivo. Para volver a entrar vas a tener que
            iniciar sesión de nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={closing}
            className="border-zinc-700 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={closing}
            onClick={() => void confirmLogout()}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {closing ? "Cerrando sesión…" : LABEL}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
