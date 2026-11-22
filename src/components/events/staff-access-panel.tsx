import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw } from "lucide-react"
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

type AccessStatus = {
  pinRequired: boolean
  pinSet: boolean
  pinUpdatedAt: string | null
}

const PIN_PATTERN = /^\d{4,6}$/
const primaryButtonClass =
  "h-10 rounded-xl bg-[#FF9500] px-4 font-semibold text-[#18120a] hover:bg-[#FFAB36]"
const secondaryButtonClass =
  "h-9 rounded-xl bg-white/[0.06] px-3 text-white/80 hover:bg-white/[0.1] hover:text-white"
const pinInputClass =
  "h-10 rounded-xl border-0 bg-white/[0.06] text-center text-base tracking-[0.4em] shadow-none placeholder:tracking-normal placeholder:text-white/25 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40 md:text-base"

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6)

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * PIN personal del link de una persona, visto por un ADMIN. Puede verlo, cambiarlo o restablecerlo
 * (la persona lo vuelve a crear en su próximo ingreso). Cambiar o restablecer cierra sus sesiones.
 * El backend valida rol, productora y formato; esto es sólo la superficie.
 */
export function StaffPinControl({
  staffId,
  name,
  isSelf
}: {
  staffId: string
  name: string
  isSelf: boolean
}) {
  const token = useAuthStore((s) => s.token)
  const [status, setStatus] = useState<AccessStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoadError(null)
    try {
      const data = await apiFetch<{ access: AccessStatus }>(`/staff/team/${staffId}/access`, { token })
      setStatus(data.access)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "No se pudo leer el acceso.")
    }
  }, [staffId, token])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleReveal() {
    if (pin !== null) return setPin(null)
    if (!token || revealing) return
    setRevealing(true)
    try {
      const data = await apiFetch<{ pin: string | null; unreadable?: boolean }>(
        `/staff/team/${staffId}/access/pin`,
        { token }
      )
      if (data.pin) setPin(data.pin)
      else
        toast.error(
          data.unreadable
            ? "No se puede leer este PIN. Restablecelo o configurá uno nuevo."
            : "Esta persona todavía no creó su PIN."
        )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo ver el PIN.")
    } finally {
      setRevealing(false)
    }
  }

  if (loadError) {
    return <p className="text-[13px] text-rose-300">{loadError}</p>
  }
  if (!status) {
    return <div className="h-9 w-48 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none" />
  }

  const since = formatDate(status.pinUpdatedAt)
  const summary = status.pinSet
    ? since
      ? `Creado o cambiado el ${since}`
      : "Configurado"
    : status.pinRequired
      ? "Lo crea la primera vez que abra su link."
      : "No usa PIN: entra sólo con el link."

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-white/45">PIN personal</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {status.pinSet ? (
          <span className="min-w-16 font-mono text-[15px] tracking-[0.3em] text-white tabular-nums">
            {pin ?? "••••"}
          </span>
        ) : null}
        <span className="text-[13px] text-white/45">{summary}</span>
        {status.pinSet ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void toggleReveal()}
            disabled={revealing}
            aria-label={pin !== null ? "Ocultar PIN" : "Ver PIN"}
            className="text-white/55 hover:bg-white/[0.06] hover:text-white"
          >
            {revealing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : pin !== null ? (
              <EyeOff className="mr-1.5 h-4 w-4" />
            ) : (
              <Eye className="mr-1.5 h-4 w-4" />
            )}
            {pin !== null ? "Ocultar" : "Ver"}
          </Button>
        ) : null}
      </div>
      {isSelf ? (
        <p className="text-[12px] text-white/35">Tu propio PIN lo cambia otro administrador.</p>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditOpen(true)}
          className={secondaryButtonClass}
        >
          <KeyRound className="mr-1.5 h-4 w-4 text-white/50" aria-hidden="true" />
          {status.pinSet ? "Cambiar PIN" : "Configurar PIN"}
        </Button>
      )}
      {!isSelf ? (
        <EditPinDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          staffId={staffId}
          name={name}
          pinSet={status.pinSet}
          pinRequired={status.pinRequired}
          onSaved={() => {
            setPin(null)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}

function EditPinDialog({
  open,
  onOpenChange,
  staffId,
  name,
  pinSet,
  pinRequired,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffId: string
  name: string
  pinSet: boolean
  pinRequired: boolean
  onSaved: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const pinId = useId()
  const confirmId = useId()
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const busy = saving || resetting

  useEffect(() => {
    if (!open) return
    setPin("")
    setConfirmPin("")
    setError(null)
  }, [open])

  async function save() {
    if (!token || busy) return
    if (!PIN_PATTERN.test(pin)) return setError("El PIN debe tener entre 4 y 6 dígitos.")
    if (pin !== confirmPin) return setError("Los dos PIN no coinciden.")
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/staff/team/${staffId}/access/pin`, {
        method: "PUT",
        token,
        body: JSON.stringify({ pin })
      })
      toast.success(`PIN de ${name} actualizado. Se cerraron sus sesiones abiertas.`)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el PIN.")
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!token || busy) return
    setResetting(true)
    try {
      await apiFetch(`/staff/team/${staffId}/access/pin`, { method: "DELETE", token })
      toast.success(
        pinRequired
          ? `PIN de ${name} restablecido. Lo va a crear de nuevo al abrir su link.`
          : `PIN de ${name} quitado. Entra sólo con su link.`
      )
      setResetOpen(false)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo restablecer el PIN.")
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-black p-0 text-white sm:max-w-md">
          <DialogHeader className="border-b border-white/[0.07] px-6 py-5 text-left">
            <DialogTitle className="text-xl">PIN de {name}</DialogTitle>
            <DialogDescription className="mt-1 text-white/60">
              Lo pide su link de acceso cada vez que entra. Al guardarlo se cierran todas sus
              sesiones abiertas: avisale el PIN nuevo.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor={pinId} className="block space-y-1.5">
                <span className="text-sm font-medium text-white/70">PIN nuevo</span>
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
            {error ? (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              {pinSet ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setResetOpen(true)}
                  className="h-10 rounded-xl px-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 sm:mr-auto"
                >
                  {pinRequired ? "Restablecer PIN" : "Quitar PIN"}
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
                {saving ? "Guardando…" : "Guardar PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={(next) => !resetting && setResetOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pinRequired ? `¿Restablecer el PIN de ${name}?` : `¿Quitar el PIN de ${name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se cierran todas sus sesiones abiertas.{" "}
              {pinRequired
                ? "La próxima vez que abra su link va a crear un PIN nuevo: quien abra el link primero lo elige, así que compartíselo sólo a esa persona."
                : "Desde ahora entra sólo con su link."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              disabled={resetting}
              onClick={() => void reset()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {resetting ? "Restableciendo…" : pinRequired ? "Restablecer PIN" : "Quitar PIN"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Link nuevo para la persona: el anterior deja de funcionar y se cierran sus sesiones. Si no tenía
 * link, se le crea uno. Sólo ADMIN; el backend lo valida.
 */
export function RegenerateLinkButton({
  staffId,
  name,
  hasLink,
  onRegenerated
}: {
  staffId: string
  name: string
  hasLink: boolean
  onRegenerated: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)

  async function regenerate() {
    if (!token || working) return
    setWorking(true)
    try {
      await apiFetch(`/staff/team/${staffId}/access/link`, { method: "POST", token })
      toast.success(
        hasLink
          ? `Link nuevo para ${name}. El anterior ya no funciona.`
          : `Link de acceso creado para ${name}.`
      )
      setOpen(false)
      onRegenerated()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el link.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => (hasLink ? setOpen(true) : void regenerate())}
        disabled={working}
        className="text-white/55 hover:bg-white/[0.06] hover:text-white"
      >
        {working ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 h-4 w-4" />
        )}
        {hasLink ? "Generar link nuevo" : "Generar link de acceso"}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !working && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar un link nuevo para {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              El link actual deja de funcionar y se cierran todas sus sesiones abiertas. Vas a tener
              que compartirle el link nuevo. Su PIN no cambia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              disabled={working}
              onClick={() => void regenerate()}
              className="bg-[#FF9500] font-semibold text-[#18120a] hover:bg-[#FFAB36]"
            >
              {working ? "Generando…" : "Generar link nuevo"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
