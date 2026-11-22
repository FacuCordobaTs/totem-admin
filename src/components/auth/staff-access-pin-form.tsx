import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PIN_PATTERN = /^\d{4,6}$/
const inputClass =
  "h-14 w-full rounded-2xl border-0 bg-white/[0.06] px-5 text-center text-xl tracking-[0.5em] shadow-none placeholder:text-base placeholder:tracking-normal placeholder:text-white/30 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40 md:text-xl"

type Props = {
  /** `setup`: primer ingreso por el link, la persona crea su PIN. `verify`: lo ingresa. */
  mode: "setup" | "verify"
  /** Persona dueña del link. */
  name?: string | null
  tenantName?: string | null
  /** Aviso de contexto, p. ej. que la sesión se cerró porque cambió el acceso. */
  notice?: string | null
  error?: string | null
  submitting: boolean
  onSubmit: (pin: string) => void
  /** Acción secundaria debajo del formulario (otra cuenta). */
  footer?: ReactNode
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6)

/**
 * PIN personal del link de acceso. Administración, gerencia y promotor general lo crean la primera
 * vez que abren su link y lo ingresan cada vez que vuelven a entrar por él. El backend valida el
 * formato, compara y limita los intentos.
 */
export function StaffAccessPinForm({
  mode,
  name,
  tenantName,
  notice,
  error,
  submitting,
  onSubmit,
  footer,
}: Props) {
  const pinId = useId()
  const confirmId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pin, setPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const setup = mode === "setup"
  const valid = PIN_PATTERN.test(pin) && (!setup || confirmPin.length > 0)
  const shownError = localError ?? error

  // Cada intento vacía los campos; al volver la respuesta (p. ej. PIN incorrecto) el foco regresa
  // para reintentar sin tocar la pantalla.
  useEffect(() => {
    if (!submitting) inputRef.current?.focus()
  }, [submitting, mode])

  return (
    <div>
      <div className="mb-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[#FF9500]">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          {setup ? "Creá tu PIN" : "Ingresá tu PIN"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          {setup ? (
            <>
              Es tu primer ingreso
              {name ? (
                <>
                  {" "}como <span className="text-white">{name}</span>
                </>
              ) : null}
              {tenantName ? ` en ${tenantName}` : ""}. Elegí un PIN de 4 a 6 dígitos: te lo vamos a
              pedir cada vez que entres con este link. No lo compartas.
            </>
          ) : (
            <>
              Para entrar
              {name ? (
                <>
                  {" "}como <span className="text-white">{name}</span>
                </>
              ) : null}{" "}
              ingresá el PIN que creaste. Si no lo recordás, pedile a un administrador que lo
              restablezca.
            </>
          )}
        </p>
      </div>

      {notice ? (
        <p className="mb-4 rounded-2xl bg-[#FF9500]/10 px-4 py-3 text-sm leading-relaxed text-[#FFB547]" role="status">
          {notice}
        </p>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || submitting) return
          if (setup && pin !== confirmPin) {
            setLocalError("Los dos PIN no coinciden.")
            setConfirmPin("")
            return
          }
          setLocalError(null)
          onSubmit(pin)
          setPin("")
          setConfirmPin("")
        }}
      >
        <label htmlFor={pinId} className="sr-only">
          {setup ? "PIN nuevo" : "PIN"}
        </label>
        <Input
          ref={inputRef}
          id={pinId}
          type="password"
          inputMode="numeric"
          autoComplete={setup ? "new-password" : "off"}
          pattern="\d*"
          maxLength={6}
          autoFocus
          placeholder={setup ? "PIN de 4 a 6 dígitos" : "Tu PIN"}
          value={pin}
          disabled={submitting}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          onChange={(event) => {
            setLocalError(null)
            setPin(digitsOnly(event.target.value))
          }}
          className={inputClass}
        />
        {setup ? (
          <>
            <label htmlFor={confirmId} className="sr-only">
              Repetir PIN
            </label>
            <Input
              id={confirmId}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d*"
              maxLength={6}
              placeholder="Repetí el PIN"
              value={confirmPin}
              disabled={submitting}
              onChange={(event) => {
                setLocalError(null)
                setConfirmPin(digitsOnly(event.target.value))
              }}
              className={inputClass}
            />
          </>
        ) : null}
        {shownError ? (
          <p id={errorId} role="alert" className="text-center text-sm text-red-400">
            {shownError}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={!valid || submitting}
          className="mt-3 h-12 w-full rounded-2xl bg-[#FF9500] text-sm font-semibold text-white shadow-none transition-all hover:bg-[#FF9500]/90 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? "Verificando…" : setup ? "Crear PIN y entrar" : "Entrar"}
        </Button>
      </form>

      {footer ? <div className="mt-6 text-center">{footer}</div> : null}
    </div>
  )
}

export const ACCESS_CHANGED_NOTICE =
  "Se cerró tu sesión porque cambió tu acceso (PIN o link nuevo). Ingresá tu PIN para seguir."
