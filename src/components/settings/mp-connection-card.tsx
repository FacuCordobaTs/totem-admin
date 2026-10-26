import { useCallback, useEffect, useState } from "react"
import { CreditCard, ExternalLink, Info } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { AccountSection, AccountLoading, AccountLoadError, ConnectionStatus } from "./account-section"

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

export function MpConnectionCard({ tenantId, token }: { tenantId: string | null; token: string | null }) {
  const [status, setStatus] = useState<MpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const load = useCallback(async () => {
    if (!token || !tenantId) { setStatus(null); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      setStatus(await apiFetch<MpStatus>("/api/mp/status", { method: "GET", token }))
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [token, tenantId])

  useEffect(() => { void load() }, [load])
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
    if (!token || disconnecting) return
    setDisconnecting(true)
    try {
      await apiFetch<{ ok: boolean }>("/api/mp/disconnect", { method: "POST", token })
      toast.success("Mercado Pago desconectado")
      await load()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo desconectar")
    } finally { setDisconnecting(false) }
  }

  if (!tenantId) return null

  return (
    <AccountSection title="Mercado Pago" description="Recibí los cobros directamente en tu cuenta." icon={CreditCard}
      status={!loading && !loadError ? <ConnectionStatus connected={connected} /> : undefined}>
      {loading ? <AccountLoading /> : loadError ? <AccountLoadError service="el estado de Mercado Pago" onRetry={() => void load()} /> : connected ? (
        <div className="account-connection-details">
          <dl><div><dt>Cuenta vinculada</dt><dd>{obfuscateMpUserId(status?.mpUserId ?? null)}</dd></div></dl>
          <button type="button" disabled={disconnecting} onClick={() => void handleDisconnect()} className="account-button account-button-danger">
            {disconnecting ? "Desconectando…" : "Desconectar"}
          </button>
        </div>
      ) : (
        <div className="account-connect">
          <p>Vinculá la cuenta de Mercado Pago en la que querés recibir los pagos de entradas y consumiciones.</p>
          <button type="button" disabled={!token || connecting} onClick={() => void handleConnect()} className="account-button account-button-primary">
            {connecting ? "Conectando…" : "Conectar Mercado Pago"}<ExternalLink aria-hidden="true" />
          </button>
          <p className="account-note"><Info aria-hidden="true" /><span>Para elegir la cuenta correcta, se cerrará la sesión de Mercado Pago y Mercado Libre en este navegador antes de continuar.</span></p>
        </div>
      )}
    </AccountSection>
  )
}
