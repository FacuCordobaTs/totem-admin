import { useCallback, useEffect, useState } from "react"
import { ArrowLeftRight } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { AccountSection, AccountLoading, AccountLoadError, ConnectionStatus } from "./account-section"

type CucuruStatus = { hasCucuruConfigured: boolean }

export function CucuruConnectionCard({ tenantId, token }: { tenantId: string | null; token: string | null }) {
  const [status, setStatus] = useState<CucuruStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [collectorId, setCollectorId] = useState("")

  const load = useCallback(async () => {
    if (!token || !tenantId) { setStatus(null); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try { setStatus(await apiFetch<CucuruStatus>("/tenants/me/cucuru", { method: "GET", token })) }
    catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [token, tenantId])

  useEffect(() => { void load() }, [load])
  const connected = status?.hasCucuruConfigured === true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || submitting) return
    const k = apiKey.trim()
    const c = collectorId.trim()
    if (!k || !c) { toast.error("Completá la API Key y el Collector ID."); return }
    setSubmitting(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/cucuru", {
        method: "PUT", token, body: JSON.stringify({ cucuruApiKey: k, cucuruCollectorId: c }),
      })
      toast.success("Cucuru conectado: webhook registrado correctamente")
      setApiKey("")
      setCollectorId("")
      setEditing(false)
      await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la configuración de Cucuru") }
    finally { setSubmitting(false) }
  }

  if (!tenantId) return null

  return (
    <AccountSection title="Cucuru" description="Cobros por transferencia con acreditación automática." icon={ArrowLeftRight}
      status={!loading && !loadError ? <ConnectionStatus connected={connected} /> : undefined}>
      {loading ? <AccountLoading /> : loadError ? <AccountLoadError service="el estado de Cucuru" onRetry={() => void load()} /> : connected && !editing ? (
        <div className="account-connection-details">
          <p>Las transferencias se notifican automáticamente a Crow.</p>
          <button type="button" className="account-button account-button-secondary" onClick={() => setEditing(true)}>Actualizar credenciales</button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="account-form">
          <p>{connected ? "Ingresá la API Key completa y el Collector ID para reemplazar las credenciales actuales." : "Ingresá las credenciales de tu cuenta de Cucuru para activar los cobros por transferencia."}</p>
          <div className="account-fields">
            <div><label htmlFor="cucuru-api-key">API Key</label><input id="cucuru-api-key" name="cucuruApiKey" type="password" autoComplete="off" required value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Pegá tu API Key" /></div>
            <div><label htmlFor="cucuru-collector-id">Collector ID</label><input id="cucuru-collector-id" name="cucuruCollectorId" type="text" autoComplete="off" required value={collectorId} onChange={(e) => setCollectorId(e.target.value)} placeholder="ID del collector" /></div>
          </div>
          <div className="account-actions">
            <button type="submit" disabled={submitting} className="account-button account-button-primary">{submitting ? "Guardando…" : "Guardar credenciales"}</button>
            {connected && editing ? <button type="button" className="account-button account-button-secondary" disabled={submitting} onClick={() => { setEditing(false); setApiKey(""); setCollectorId("") }}>Cancelar</button> : null}
          </div>
          <p className="account-note">Al guardar, Crow registra la conexión para recibir los avisos de tus transferencias.</p>
        </form>
      )}
    </AccountSection>
  )
}
