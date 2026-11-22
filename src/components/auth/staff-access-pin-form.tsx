import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PIN_PATTERN = /^\d{4,6}$/

type Props = {
  /** Persona que está entrando (del link o de la cuenta elegida). */
  name?: string | null
  tenantName?: string | null
  /** Aviso de contexto, p. ej. que la sesión se cerró porque se activó el PIN. */
  notice?: string | null
  error?: string | null
  submitting: boolean
  onSubmit: (pin: string) => void
  /** Acción secundaria debajo del formulario (otra cuenta, volver). */
  footer?: ReactNode
}

/**
 * Paso del PIN de acceso del equipo: lo pide la productora además del link o la contraseña. Se usa
 * en el link de acceso, el login y el magic link; el backend valida y limita los intentos.
 */
export function StaffAccessPinForm({
  name,
  tenantName,
  notice,
  error,
  submitting,
  onSubmit,
  footer,
}: Props) {
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pin, setPin] = useState("")
  const valid = PIN_PATTERN.test(pin)

  // Cada intento vacía el campo; al volver la respuesta (p. ej. PIN incorrecto) el foco regresa para
  // reintentar sin tocar la pantalla.
  useEffect(() => {
    if (!submitting) inputRef.current?.focus()
  }, [submitting])

  return (
    <div>
      <div className="mb-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[#FF9500]">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">PIN de acceso</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          {tenantName ? `${tenantName} pide` : "La productora pide"} un PIN para entrar
          {name ? (
            <>
              {" "}como <span className="text-white">{name}</span>
            </>
          ) : null}
          . Pedíselo a quien administra el equipo.
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
          onSubmit(pin)
          setPin("")
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          PIN de acceso
        </label>
        <Input
          ref={inputRef}
          id={inputId}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d*"
          maxLength={6}
          autoFocus
          placeholder="PIN de 4 a 6 dígitos"
          value={pin}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-14 w-full rounded-2xl border-0 bg-white/[0.06] px-5 text-center text-xl tracking-[0.5em] md:text-xl shadow-none placeholder:text-base placeholder:tracking-normal placeholder:text-white/30 focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#FF9500]/40"
        />
        {error ? (
          <p id={errorId} role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={!valid || submitting}
          className="mt-3 h-12 w-full rounded-2xl bg-[#FF9500] text-sm font-semibold text-white shadow-none transition-all hover:bg-[#FF9500]/90 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? "Verificando…" : "Entrar"}
        </Button>
      </form>

      {footer ? <div className="mt-6 text-center">{footer}</div> : null}
    </div>
  )
}

export const ACCESS_PIN_REVOKED_NOTICE =
  "Se cerró tu sesión porque la productora activó o cambió el PIN de acceso. Ingresalo para seguir."
