import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { CheckCircle2, MonitorSmartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch, ApiError, publicApiFetch } from "@/lib/api"
import { useAuthStore, type StaffRole } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"
import { homeForRole } from "@/lib/staff-home"

type DeviceLinkInfo = {
  access: "pos" | "security" | null
  status: "pending" | "approved" | "claimed" | "expired"
  expiresAt: string
}

/** Evento con sus barras activas, tal como lo agrupa `GET /staff/device-links/:code/bars`. */
type AssignableEvent = {
  id: string
  name: string
  bars: { id: string; name: string; isDefault: boolean }[]
}

/** Estados del selector que no son "elegir una barra": no tocar la fijación, o quitarla. */
const KEEP_ASSIGNMENT = "__keep__"
const CLEAR_ASSIGNMENT = "__none__"

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
 *
 * Si el equipo está abriendo el POS y quien aprueba es ADMIN o MANAGER, además elige cuál barra ES
 * esa computadora: el POS queda fijado a ese puesto hasta que se reasigne con otro QR. La potestad
 * la valida el backend al aprobar; este selector sólo evita el viaje en vano.
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
  const [events, setEvents] = useState<AssignableEvent[]>([])
  const [loadingBars, setLoadingBars] = useState(false)
  const [barsError, setBarsError] = useState<string | null>(null)
  // Falla de la barra elegida, no del vínculo: el código sigue vivo y se puede reintentar.
  const [assignError, setAssignError] = useState<string | null>(null)
  const [choice, setChoice] = useState<string>(KEEP_ASSIGNMENT)

  const canAssignBar =
    info?.access === "pos" && (staff?.role === "ADMIN" || staff?.role === "MANAGER")

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

  // Las barras se piden recién cuando ya se sabe que el vínculo es de POS, está pendiente y la
  // cuenta puede asignar. Si falla, se avisa y se aprueba igual: sin elección, la computadora
  // conserva la barra que ya tenía.
  useEffect(() => {
    if (!hydrated || !token || !code || !canAssignBar || info?.status !== "pending") return
    let cancelled = false
    setLoadingBars(true)
    setBarsError(null)
    void (async () => {
      try {
        const data = await apiFetch<{ events: AssignableEvent[] }>(
          `/staff/device-links/${encodeURIComponent(code)}/bars`,
          { token }
        )
        if (!cancelled) setEvents(data.events)
      } catch (err) {
        if (!cancelled) {
          setBarsError(
            err instanceof ApiError ? err.message : "No se pudieron cargar las barras"
          )
        }
      } finally {
        if (!cancelled) setLoadingBars(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canAssignBar, code, hydrated, info?.status, token])

  /** Cuerpo del approve: la elección del selector, o nada si se deja la barra como está. */
  const assignmentBody = useCallback((): Record<string, unknown> => {
    if (choice === KEEP_ASSIGNMENT) return {}
    if (choice === CLEAR_ASSIGNMENT) return { assignment: null }
    const event = events.find((e) => e.bars.some((b) => b.id === choice))
    if (!event) return {}
    return { assignment: { eventId: event.id, barId: choice } }
  }, [choice, events])

  const approve = useCallback(async () => {
    if (!token || !code) return
    setApproving(true)
    setError(null)
    setAssignError(null)
    try {
      await apiFetch(`/staff/device-links/${encodeURIComponent(code)}/approve`, {
        method: "POST",
        token,
        body: JSON.stringify(assignmentBody()),
      })
      setLinked(true)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "No se pudo vincular la computadora"
      // La barra dejó de ser válida entre la lista y la aprobación (o nunca lo fue): el código
      // sigue pendiente, así que se avisa acá y se deja elegir otra en vez de dar el vínculo por
      // perdido. El resto de los errores sí son terminales para este código.
      if (canAssignBar && err instanceof ApiError && err.status === 404) {
        setAssignError(`${message} Elegí otra barra o dejá la que ya tenía.`)
      } else {
        setError(message)
      }
    } finally {
      setApproving(false)
    }
  }, [assignmentBody, canAssignBar, code, token])

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

            {canAssignBar ? (
              <div className="mt-3 rounded-2xl bg-white/[0.08] p-4 text-left">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#FF9500]">
                  Barra de esta computadora
                </label>
                {loadingBars ? (
                  <p className="text-[13px] text-white/50">Buscando barras…</p>
                ) : barsError ? (
                  <p className="text-[13px] leading-relaxed text-amber-100/80">
                    {barsError} Podés vincular igual: la computadora mantiene la barra que ya tenía.
                  </p>
                ) : events.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-white/50">
                    No hay barras activas para elegir en este momento.
                  </p>
                ) : (
                  <>
                    <Select
                      value={choice}
                      onValueChange={(value) => {
                        setChoice(value)
                        setAssignError(null)
                      }}
                    >
                      <SelectTrigger className="h-11 w-full rounded-xl border-white/15 bg-black/30 text-sm text-white data-placeholder:text-white/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value={KEEP_ASSIGNMENT} className="rounded-lg py-2.5">
                          Dejar la barra como está
                        </SelectItem>
                        {events.map((event) => (
                          <SelectGroup key={event.id}>
                            <SelectLabel>{event.name}</SelectLabel>
                            {event.bars.map((bar) => (
                              <SelectItem key={bar.id} value={bar.id} className="rounded-lg py-2.5">
                                {bar.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                        <SelectItem value={CLEAR_ASSIGNMENT} className="rounded-lg py-2.5">
                          Quitar la barra asignada
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs leading-relaxed text-white/40">
                      La computadora queda fijada a esa barra hasta que la reasignes con otro código.
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {assignError ? (
              <p
                className="mt-4 rounded-2xl border border-amber-200/40 bg-amber-50/10 px-4 py-3 text-sm leading-relaxed text-amber-100/90"
                role="alert"
              >
                {assignError}
              </p>
            ) : null}

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
