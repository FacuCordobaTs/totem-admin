import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"

export type StaffAccessPinState = { enabled: boolean; updatedAt: string | null }
type AccessPinResponse = { accessPin: StaffAccessPinState }

const PIN_PATTERN = /^\d{4,6}$/
const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const pinInputClass =
  "h-10 rounded-xl border-0 bg-white/[0.06] text-center text-base tracking-[0.4em] shadow-none placeholder:tracking-normal placeholder:text-white/25 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40 md:text-base"

function formatAccessPinDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })
}

/** Sólo dígitos, como máximo 6: el teclado numérico del celular igual deja pegar cualquier cosa. */
const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6)

/**
 * PIN de acceso del equipo (lo configura ADMIN). Activarlo o cambiarlo cierra la sesión de todo el
 * personal conectado salvo los administradores: vuelven a entrar con su link y el PIN. El backend
 * valida el rol, el formato y guarda sólo el hash; el PIN no se puede volver a ver.
 */
export function StaffAccessPinDialog({
  open,
  onOpenChange,
  state,
  onChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: StaffAccessPinState
  onChange: (state: StaffAccessPinState) => void
}) {
  const token = useAuthStore((s) => s.token)
  const pinId = useId()
  const confirmId = useId()
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disabling, setDisabling] = useState(false)

  useEffect(() => {
    if (!open) return
    setPin("")
    setConfirmPin("")
    setError(null)
  }, [open])

  const busy = saving || disabling
  const since = formatAccessPinDate(state.updatedAt)

  async function save() {
    if (!token || busy) return
    if (!PIN_PATTERN.test(pin)) return setError("El PIN debe tener entre 4 y 6 dígitos.")
    if (pin !== confirmPin) return setError("Los dos PIN no coinciden.")
    setSaving(true)
    setError(null)
    try {
      const data = await apiFetch<AccessPinResponse>("/staff/access-pin", {
        method: "PUT",
        token,
        body: JSON.stringify({ pin })
      })
      onChange(data.accessPin)
      toast.success(
        state.enabled
          ? "PIN cambiado. El personal tiene que volver a entrar con el PIN nuevo."
          : "PIN activado. Se cerró la sesión del personal conectado."
      )
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el PIN.")
    } finally {
      setSaving(false)
    }
  }

  async function disable() {
    if (!token || busy) return
    setDisabling(true)
    try {
      const data = await apiFetch<AccessPinResponse>("/staff/access-pin", {
        method: "DELETE",
        token
      })
      onChange(data.accessPin)
      toast.success("PIN desactivado. El personal vuelve a entrar sólo con su link.")
      setDisableOpen(false)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo desactivar el PIN.")
    } finally {
      setDisabling(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-black p-0 text-white sm:max-w-md">
          <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left">
            <DialogTitle className="text-xl">PIN de acceso del equipo</DialogTitle>
            <DialogDescription className="mt-1 text-white/60">
              Además de su link, el personal tiene que ingresar este PIN para entrar a Crow. Los
              administradores entran sin PIN.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <p className="text-sm text-white/65">
              {state.enabled ? (
                <>
                  <span className="font-medium text-emerald-300">Activo</span>
                  {since ? ` · desde el ${since}` : null}
                </>
              ) : (
                <span className="text-white/55">Desactivado: hoy se entra sólo con el link.</span>
              )}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor={pinId} className="block space-y-1.5">
                <span className="text-sm font-medium text-white/70">
                  {state.enabled ? "PIN nuevo" : "PIN"}
                </span>
                <Input
                  id={pinId}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  placeholder="4 a 6 dígitos"
                  disabled={busy}
                  value={pin}
                  onChange={(event) => setPin(digitsOnly(event.target.value))}
                  className={pinInputClass}
                />
              </label>
              <label htmlFor={confirmId} className="block space-y-1.5">
                <span className="text-sm font-medium text-white/70">Repetir PIN</span>
                <Input
                  id={confirmId}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  placeholder="4 a 6 dígitos"
                  disabled={busy}
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(digitsOnly(event.target.value))}
                  className={pinInputClass}
                />
              </label>
            </div>

            <div className="space-y-2 text-[13px] leading-relaxed">
              <p className="text-[#FFB547]">
                Al {state.enabled ? "cambiarlo" : "activarlo"} se cierra la sesión de todo el
                personal conectado. Para volver a entrar van a necesitar su link y este PIN.
              </p>
              <p className="text-white/45">
                Guardalo en un lugar seguro: no se puede volver a ver. Si lo olvidás, configurá uno
                nuevo.
              </p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              {state.enabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDisableOpen(true)}
                  className="h-10 rounded-xl px-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 sm:mr-auto"
                >
                  Desactivar PIN
                </Button>
              ) : (
                <span className="hidden sm:mr-auto sm:block" />
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-xl px-4 text-white/70 hover:bg-white/[0.06] hover:text-white"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className={primaryButtonClass}>
                {saving
                  ? "Guardando…"
                  : state.enabled
                    ? "Cambiar PIN"
                    : "Activar PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disableOpen} onOpenChange={(next) => !disabling && setDisableOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar el PIN de acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              Las sesiones abiertas siguen funcionando y los próximos ingresos vuelven a ser sólo
              con el link de cada persona.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabling}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              disabled={disabling}
              onClick={() => void disable()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {disabling ? "Desactivando…" : "Desactivar PIN"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
