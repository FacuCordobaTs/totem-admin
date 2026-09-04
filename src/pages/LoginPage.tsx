import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ArrowLeft, Eye, EyeOff, ShieldCheck, Store, UserRoundCog } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile } from "@/stores/auth-store"
import { BrandLockup } from "@/components/auth/brand-lockup"
import { cn } from "@/lib/utils"
import { getStaffLoginUrl } from "@/lib/staff-app-url"

type LoginResponse = {
  message: string
  token: string
  staff: StaffProfile
}

type TenantSelectionResponse = {
  requiresTenantSelection: true
  options: { staffId: string; tenantName: string }[]
}

type EntryMode = "admin" | "pos" | "security"

const roleHandoff = {
  pos: {
    title: "POS y barra",
    description: "Cobrar ventas, canjear consumiciones y entregar pedidos.",
    phoneHint: "Abrí el POS desde tu teléfono.",
    icon: Store,
  },
  security: {
    title: "Acceso y seguridad",
    description: "Validar entradas y controlar el acceso al evento.",
    phoneHint: "Abrí el escáner desde tu teléfono.",
    icon: ShieldCheck,
  },
} as const

const inputClass =
  "h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-0 focus-visible:ring-0 focus-visible:bg-zinc-200/70 dark:focus-visible:bg-zinc-800 transition-colors text-base px-5 w-full shadow-none"

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const requestedAccess = searchParams.get("access")
  const requestedMode: Exclude<EntryMode, "admin"> | null =
    requestedAccess === "pos" || requestedAccess === "security" ? requestedAccess : null
  const [entryMode, setEntryMode] = useState<EntryMode | null>(() => requestedMode)
  const [showCredentials, setShowCredentials] = useState(() => requestedMode !== null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tenantOptions, setTenantOptions] = useState<TenantSelectionResponse["options"] | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [magicDevUrl, setMagicDevUrl] = useState<string | null>(null)

  function chooseMode(mode: EntryMode) {
    setError(null)
    setEntryMode(mode)
    setShowCredentials(mode === "admin")
  }

  function goBackToModes() {
    setError(null)
    setEntryMode(null)
    setShowCredentials(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, string> = { email, password }
      if (selectedStaffId) body.staffId = selectedStaffId

      const data = await apiFetch<LoginResponse | TenantSelectionResponse>("/staff/login", {
        method: "POST",
        body: JSON.stringify(body),
      })

      if ("requiresTenantSelection" in data && data.requiresTenantSelection) {
        setTenantOptions(data.options)
        setSelectedStaffId(data.options[0]?.staffId ?? null)
        return
      }

      const loginData = data as LoginResponse
      setAuth(loginData.token, loginData.staff)
      const home =
        loginData.staff.role === "BARTENDER"
          ? "/pos"
          : loginData.staff.role === "SECURITY"
            ? "/scanner"
            : "/"
      navigate(home, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  async function onMagicLink() {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Escribí tu correo y te mandamos el enlace")
      return
    }
    setMagicLoading(true)
    try {
      const data = await apiFetch<{ ok: true; devUrl?: string }>("/staff/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setMagicSent(true)
      setMagicDevUrl(data.devUrl ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el enlace")
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center w-full bg-black px-6 selection:bg-[#FF9500]/10 selection:text-[#FF9500]">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        <BrandLockup className="mb-12" />

        {entryMode === null ? (
          <div className="space-y-3">
            <div className="mb-7 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">¿Cómo vas a entrar?</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                Elegí el módulo que vas a usar en este momento.
              </p>
            </div>
            <EntryButton
              icon={UserRoundCog}
              title="Administración"
              description="Eventos, equipo, inventario y reportes."
              onClick={() => chooseMode("admin")}
            />
            <EntryButton
              icon={Store}
              title="POS y barra"
              description="Usar caja o canjear consumiciones desde el teléfono."
              onClick={() => chooseMode("pos")}
            />
            <EntryButton
              icon={ShieldCheck}
              title="Acceso y seguridad"
              description="Escanear entradas desde el teléfono."
              onClick={() => chooseMode("security")}
            />
          </div>
        ) : !showCredentials && entryMode !== "admin" ? (
          <PhoneHandoff
            mode={entryMode}
            onBack={goBackToModes}
            onUseThisDevice={() => setShowCredentials(true)}
          />
        ) : (
          <>
            <div className="mb-7 text-center">
              {!requestedMode ? (
                <button
                  type="button"
                  onClick={goBackToModes}
                  className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" /> Cambiar módulo
                </button>
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {entryMode === "admin" ? "Administración" : roleHandoff[entryMode].title}
              </h1>
              {entryMode !== "admin" ? (
                <p className="mt-2 text-sm text-white/50">Ingresá con tu cuenta de personal.</p>
              ) : null}
            </div>

            {error ? (
              <p
                className="mb-4 rounded-2xl border border-red-200/60 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-3">
          <Input
            id="login-email"
            type="email"
            placeholder="Correo electrónico"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setTenantOptions(null)
              setSelectedStaffId(null)
              setMagicSent(false)
              setMagicDevUrl(null)
            }}
            required
            className={inputClass}
          />

          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setTenantOptions(null)
                setSelectedStaffId(null)
              }}
              required
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {tenantOptions && tenantOptions.length > 1 ? (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-sm font-medium text-muted-foreground px-1">Seleccioná la Productora</p>
              {tenantOptions.map((opt) => (
                <button
                  key={opt.staffId}
                  type="button"
                  onClick={() => setSelectedStaffId(opt.staffId)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-all ${
                    selectedStaffId === opt.staffId
                      ? "bg-[#FF9500]/10 font-semibold text-[#FF9500]"
                      : "bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      selectedStaffId === opt.staffId
                        ? "border-[#FF9500] bg-[#FF9500]"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  />
                  {opt.tenantName}
                </button>
              ))}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={loading || (tenantOptions !== null && !selectedStaffId)}
            className="w-full h-12 mt-3 rounded-2xl text-sm font-semibold bg-[#FF9500] hover:bg-[#FF9500]/90 text-white shadow-none transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Entrando…" : tenantOptions ? "Continuar" : "Entrar"}
          </Button>
            </form>

            {magicSent ? (
              <div className="mt-6 rounded-2xl bg-zinc-100 px-4 py-3 text-center text-sm text-muted-foreground dark:bg-zinc-900">
                <p>Si el correo existe, te enviamos un enlace de acceso. Revisá tu casilla.</p>
                {magicDevUrl ? (
                  <a
                    href={magicDevUrl}
                    className="mt-2 inline-block break-all text-[#FF9500] hover:text-[#FF9500]/80"
                  >
                    {magicDevUrl}
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={onMagicLink}
                  disabled={magicLoading}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                >
                  {magicLoading ? "Enviando…" : "Recibir un enlace de acceso"}
                </button>
              </div>
            )}

            <div className="text-center text-sm mt-10">
              <Link
                to="/register"
                className="text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                Crear cuenta de administrador
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EntryButton({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Store
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl bg-white/[0.08] p-4 text-left transition-colors hover:bg-white/[0.14] active:bg-white/[0.18]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF9500]/15 text-[#FF9500]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-white/50">{description}</span>
      </span>
    </button>
  )
}

function PhoneHandoff({
  mode,
  onBack,
  onUseThisDevice,
}: {
  mode: Exclude<EntryMode, "admin">
  onBack: () => void
  onUseThisDevice: () => void
}) {
  const details = roleHandoff[mode]
  const Icon = details.icon
  const url = getStaffLoginUrl(mode)

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Cambiar módulo
      </button>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[#FF9500]">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">{details.title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/50">
        {details.phoneHint} Escaneá el código e iniciá sesión en Crow web.
      </p>
      <div className="mx-auto mt-7 inline-flex rounded-3xl bg-white p-4 shadow-2xl shadow-black/30">
        <QRCodeSVG value={url} size={184} level="M" includeMargin />
      </div>
      <p className="mt-5 text-xs leading-relaxed text-white/35">
        El QR no contiene permisos ni credenciales: el rol se valida al iniciar sesión.
      </p>
      <button
        type="button"
        onClick={onUseThisDevice}
        className="mt-6 text-sm text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        Iniciar sesión en esta computadora
      </button>
    </div>
  )
}
