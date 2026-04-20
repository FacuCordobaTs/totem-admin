import { useCallback, useEffect, useState } from "react"
import { Check } from "lucide-react"
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

function buildMpAuthUrl(tenantId: string): string | null {
  const clientId = import.meta.env.VITE_MP_APP_ID
  const redirectUri = import.meta.env.VITE_MP_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return null
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    state: tenantId,
    redirect_uri: redirectUri,
  })
  return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`
}

type MpConnectionCardProps = {
  tenantId: string | null
  token: string | null
  className?: string
}

export function MpConnectionCard({ tenantId, token, className }: MpConnectionCardProps) {
  const [status, setStatus] = useState<MpStatus | null>(null)
  const [loading, setLoading] = useState(true)
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

  const authUrl = tenantId ? buildMpAuthUrl(tenantId) : null
  const connected = status?.mpConnected === true

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
              Connect Mercado Pago to receive payments directly into your account.
            </p>
            {authUrl ? (
              <Button
                asChild
                size="lg"
                className="w-full rounded-xl border-0 bg-white text-black hover:bg-zinc-200 sm:w-auto"
              >
                <a href={authUrl} rel="noopener noreferrer">
                  Conectar Mercado Pago
                </a>
              </Button>
            ) : (
              <p className="text-sm text-amber-500">
                Faltan VITE_MP_APP_ID o VITE_MP_REDIRECT_URI en el entorno del admin.
              </p>
            )}
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
              {disconnecting ? "Desconectando…" : "Disconnect"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
