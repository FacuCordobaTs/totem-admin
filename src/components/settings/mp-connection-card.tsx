import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

type MpStatus = {
  mpConnected: boolean
  mpPublicKey: string | null
  mpUserId: string | null
}

function obfuscateMpUserId(raw: string | null): string {
  if (!raw || raw.length < 2) return "—"
  const t = raw.trim()
  if (t.length <= 6) return `${t.slice(0, 1)}••••`
  return `${t.slice(0, 4)}••••••${t.slice(-4)}`
}

type MpConnectionCardProps = {
  tenantId: string | null
  token: string | null
  className?: string
  /**
   * `card` (Cuenta → Pagos): la tarjeta con título, detalle de cuenta y desconexión.
   * `inline` (header del evento): un solo control compacto que entra en la fila de acciones
   * junto a "Abrir venta", sin arrastrar el layout de tarjeta.
   */
  variant?: "card" | "inline"
}

export function MpConnectionCard({
  tenantId,
  token,
  className,
  variant = "card",
}: MpConnectionCardProps) {
  const [status, setStatus] = useState<MpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const load = useCallback(async () => {
    if (!token || !tenantId) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await apiFetch<MpStatus>("/api/mp/status", {
        method: "GET",
        token,
      })
      setStatus(data)
    } catch {
      setStatus(null)
      toast.error("No se pudo cargar el estado de Mercado Pago")
    } finally {
      setLoading(false)
    }
  }, [token, tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const connected = status?.mpConnected === true

  async function handleConnect() {
    if (!token || !tenantId || connecting) return
    setConnecting(true)
    try {
      const { url } = await apiFetch<{ url: string }>("/api/mp/auth-url", { token })
      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo iniciar la conexión con Mercado Pago")
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiFetch<{ ok: boolean }>("/api/mp/disconnect", {
        method: "POST",
        token,
      })
      toast.success("Mercado Pago desconectado")
      await load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo desconectar")
    } finally {
      setDisconnecting(false)
    }
  }

  if (!tenantId) {
    return null
  }

  // Inline: mismo alto que los botones del header (h-9) y un solo elemento. Desconectado es la
  // acción que destraba "Abrir venta"; conectado, un chip de estado que no compite con el CTA.
  if (variant === "inline") {
    if (loading) {
      return (
        <div
          aria-hidden
          className={cn("h-9 w-40 animate-pulse rounded-lg bg-white/[0.04]", className)}
        />
      )
    }
    if (!connected) {
      return (
        <Button
          type="button"
          variant="ghost"
          disabled={!token || connecting}
          onClick={() => void handleConnect()}
          className={cn(
            "h-9 shrink-0 gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.05] px-4 text-[13px] font-medium text-white/70",
            "hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-40",
            className
          )}
        >
          {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {connecting ? "Conectando…" : "Conectar Mercado Pago"}
        </Button>
      )
    }
    return (
      <Link
        to="/configuracion"
        aria-label="Mercado Pago conectado. Ver la configuración de pagos."
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3",
          "text-[12px] font-medium text-emerald-300/90 transition-colors",
          "hover:border-emerald-500/30 hover:bg-emerald-500/[0.12]",
          className
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Mercado Pago conectado
      </Link>
    )
  }

  return (
    <Card
      className={cn(
        "border border-zinc-800 bg-black text-white shadow-none ring-0 dark:bg-black",
        "rounded-xl",
        className
      )}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold tracking-tight text-white">
          Mercado Pago
        </CardTitle>
        <CardDescription className="text-zinc-500 dark:text-zinc-500">
          Cobros en cuenta del productor (marketplace).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : !connected ? (
          <div className="space-y-4">
            <p className="text-[15px] leading-relaxed text-zinc-300">
              Conectá Mercado Pago para recibir los cobros directo en tu cuenta.
            </p>
            <Button
              type="button"
              disabled={!token || connecting}
              onClick={() => void handleConnect()}
              size="lg"
              className="w-full rounded-xl border-0 bg-white text-black hover:bg-zinc-200 sm:w-auto"
            >
              {connecting ? "Conectando…" : "Conectar Mercado Pago"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant="outline"
                  className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 shadow-none"
                >
                  <Check className="size-3.5 text-emerald-400" aria-hidden />
                  Conectado
                </Badge>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Cuenta MP
                  </p>
                  <p className="font-mono text-sm tracking-tight text-zinc-100">
                    {obfuscateMpUserId(status?.mpUserId ?? null)}
                  </p>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={disconnecting}
              onClick={() => void handleDisconnect()}
              className="w-full rounded-xl border border-red-500/30 bg-red-950/80 text-red-200 hover:bg-red-900/90 sm:w-auto"
            >
              {disconnecting ? "Desconectando…" : "Desconectar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
