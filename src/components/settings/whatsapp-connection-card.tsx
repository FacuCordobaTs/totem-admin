import { useCallback, useEffect, useState } from "react"
import { MessageCircle, Send } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { AccountSection, AccountLoading, AccountLoadError, ConnectionStatus } from "./account-section"

type WhatsAppStatus = {
  hasWhatsAppConfigured: boolean
  whatsappPhone: string | null
  whatsappTemplateName: string
}

/** Platform credentials are managed by Crow; the tenant only sees status and can send a test. */
export function WhatsAppConnectionCard({ tenantId, token }: { tenantId: string | null; token: string | null }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testNumber, setTestNumber] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

  const load = useCallback(async () => {
    if (!token || !tenantId) { setStatus(null); setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try { setStatus(await apiFetch<WhatsAppStatus>("/tenants/me/whatsapp", { method: "GET", token })) }
    catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [token, tenantId])

  useEffect(() => { void load() }, [load])
  const connected = status?.hasWhatsAppConfigured === true

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault()
    if (!token || sendingTest) return
    const to = testNumber.trim()
    if (!to) { toast.error("Escribí el número al que mandar la prueba."); return }
    setSendingTest(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/whatsapp/test", { method: "POST", token, body: JSON.stringify({ to }) })
      toast.success(`Mensaje de prueba enviado a ${to}`)
      setTestNumber("")
      setTesting(false)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje de prueba") }
    finally { setSendingTest(false) }
  }

  if (!tenantId) return null

  return (
    <AccountSection title="Mensajes de Crow" description="Recordatorios, códigos de acceso y avisos a tus clientes." icon={MessageCircle}
      status={!loading && !loadError ? <ConnectionStatus connected={connected} label={connected ? "Activo" : "Todavía no disponible"} /> : undefined}>
      {loading ? <AccountLoading /> : loadError ? <AccountLoadError service="el estado de WhatsApp" onRetry={() => void load()} /> : connected ? (
        <div className="account-messaging">
          <dl className="account-details account-details-compact">
            <div><dt>Número de envío</dt><dd>{status?.whatsappPhone ?? "—"}</dd></div>
            <div><dt>Plantilla de recordatorio</dt><dd>{status?.whatsappTemplateName ?? "crow_recordatorio"}</dd></div>
          </dl>
          <p>Los mensajes salen desde el WhatsApp Business de Crow. No necesitás configurar una cuenta propia. Si necesitás otro número, escribinos.</p>
          {!testing ? <button type="button" className="account-button account-button-secondary" onClick={() => setTesting(true)}><Send aria-hidden="true" />Enviar mensaje de prueba</button> : (
            <form onSubmit={(e) => void handleSendTest(e)} className="account-test-form account-form">
              <label htmlFor="whatsapp-test-number">Número de destino</label>
              <p id="whatsapp-test-help">Incluí el código de área. Por ejemplo, 1155555555.</p>
              <input id="whatsapp-test-number" name="testNumber" type="tel" autoComplete="tel-national" required value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="1155555555" aria-describedby="whatsapp-test-help" autoFocus />
              <div className="account-actions">
                <button type="submit" disabled={sendingTest} className="account-button account-button-primary">{sendingTest ? "Enviando…" : "Enviar prueba"}</button>
                <button type="button" disabled={sendingTest} className="account-button account-button-secondary" onClick={() => setTesting(false)}>Cancelar</button>
              </div>
              <p className="account-note">Se enviará la plantilla de prueba de Crow. El destinatario no necesita haber escrito antes.</p>
            </form>
          )}
        </div>
      ) : (
        <div className="account-connect"><p>Crow está terminando de habilitar WhatsApp. Cuando esté disponible, los mensajes a tus clientes saldrán desde el número de la plataforma.</p><p className="account-note">No necesitás cargar credenciales ni configurar una cuenta.</p></div>
      )}
    </AccountSection>
  )
}
