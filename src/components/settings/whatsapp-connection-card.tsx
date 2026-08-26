import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

type WhatsAppStatus = {
  hasWhatsAppConfigured: boolean
  whatsappPhone: string | null
  whatsappTemplateName: string
}

type WhatsAppConnectionCardProps = {
  tenantId: string | null
  token: string | null
  className?: string
}

export function WhatsAppConnectionCard({
  tenantId,
  token,
  className,
}: WhatsAppConnectionCardProps) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testNumber, setTestNumber] = useState("")
  const [sendingTest, setSendingTest] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [phone, setPhone] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [whatsappToken, setWhatsappToken] = useState("")
  const [templateName, setTemplateName] = useState("")

  const load = useCallback(async () => {
    if (!token || !tenantId) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await apiFetch<WhatsAppStatus>("/tenants/me/whatsapp", {
        method: "GET",
        token,
      })
      setStatus(data)
    } catch {
      setStatus(null)
      toast.error("No se pudo cargar el estado de WhatsApp")
    } finally {
      setLoading(false)
    }
  }, [token, tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const connected = status?.hasWhatsAppConfigured === true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    const p = phone.trim()
    const nid = phoneNumberId.trim()
    const t = whatsappToken.trim()
    if (!p || !nid || !t) {
      toast.error("Completá el número, el Phone Number ID y el token.")
      return
    }
    setSubmitting(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/whatsapp", {
        method: "PUT",
        token,
        body: JSON.stringify({
          whatsappPhone: p,
          whatsappPhoneNumberId: nid,
          whatsappToken: t,
          whatsappTemplateName: templateName.trim() || undefined,
        }),
      })
      toast.success("WhatsApp conectado: credenciales validadas con Meta")
      setPhone("")
      setPhoneNumberId("")
      setWhatsappToken("")
      setTemplateName("")
      setEditing(false)
      await load()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar la configuración de WhatsApp"
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    const to = testNumber.trim()
    if (!to) {
      toast.error("Escribí el número al que mandar la prueba.")
      return
    }
    setSendingTest(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/whatsapp/test", {
        method: "POST",
        token,
        body: JSON.stringify({ to }),
      })
      toast.success(`Mensaje de prueba enviado a ${to}`)
      setTestNumber("")
      setTesting(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo enviar el mensaje de prueba"
      )
    } finally {
      setSendingTest(false)
    }
  }

  async function handleDisconnect() {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/whatsapp", {
        method: "DELETE",
        token,
      })
      toast.success("WhatsApp desconectado")
      await load()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo desconectar WhatsApp"
      )
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
        "border border-zinc-800 bg-zinc-950 text-white shadow-none ring-0 dark:bg-zinc-950",
        "rounded-xl",
        className
      )}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold tracking-tight text-white">
          WhatsApp
        </CardTitle>
        <CardDescription className="text-zinc-500 dark:text-zinc-500">
          Recordatorios automáticos y mensajes a clientes (Meta Cloud API).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : connected && !editing ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 shadow-none"
              >
                <Check className="size-3.5 text-emerald-400" aria-hidden />
                Conectado y activo
              </Badge>
            </div>
            <div className="space-y-1 text-[15px] text-zinc-300">
              <p>
                Número:{" "}
                <span className="font-medium text-zinc-100">
                  {status?.whatsappPhone ?? "—"}
                </span>
              </p>
              <p>
                Template del recordatorio:{" "}
                <span className="font-medium text-zinc-100">
                  {status?.whatsappTemplateName ?? "crow_recordatorio"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                onClick={() => {
                  setEditing(true)
                  setTemplateName(
                    status?.whatsappTemplateName &&
                      status.whatsappTemplateName !== "crow_recordatorio"
                      ? status.whatsappTemplateName
                      : ""
                  )
                }}
              >
                Actualizar credenciales
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                onClick={() => setTesting((v) => !v)}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Enviar mensaje de prueba
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                disabled={disconnecting}
                onClick={() => void handleDisconnect()}
              >
                {disconnecting ? "Desconectando…" : "Desconectar"}
              </Button>
            </div>
            {testing ? (
              <form
                onSubmit={(e) => void handleSendTest(e)}
                className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <label
                  htmlFor="whatsapp-test-number"
                  className="block text-[13px] font-medium text-zinc-500"
                >
                  Número de destino (ej. 1155555555)
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="whatsapp-test-number"
                    name="testNumber"
                    type="tel"
                    autoComplete="off"
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    className="h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                    placeholder="1155555555"
                  />
                  <Button
                    type="submit"
                    disabled={sendingTest}
                    className="min-w-[140px] rounded-xl border-0 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {sendingTest ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Enviando…
                      </>
                    ) : (
                      "Enviar prueba"
                    )}
                  </Button>
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-500">
                  Manda el template <span className="text-zinc-400">crow_prueba</span>{" "}
                  (aprobado en Meta) a ese número. El destinatario no necesita tener
                  la app ni haberte escrito antes.
                </p>
              </form>
            ) : null}
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {connected && editing ? (
              <p className="text-[13px] text-zinc-500">
                Volvé a ingresar el token y el Phone Number ID para actualizar.
              </p>
            ) : null}
            <div className="space-y-2">
              <label
                htmlFor="whatsapp-phone"
                className="block text-[13px] font-medium text-zinc-500"
              >
                Número de WhatsApp Business
              </label>
              <input
                id="whatsapp-phone"
                name="whatsappPhone"
                type="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="5491155555555"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="whatsapp-phone-number-id"
                className="block text-[13px] font-medium text-zinc-500"
              >
                Phone Number ID
              </label>
              <input
                id="whatsapp-phone-number-id"
                name="whatsappPhoneNumberId"
                type="text"
                autoComplete="off"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="ID del número (Meta Business)"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="whatsapp-token"
                className="block text-[13px] font-medium text-zinc-500"
              >
                Token de acceso (System User)
              </label>
              <input
                id="whatsapp-token"
                name="whatsappToken"
                type="password"
                autoComplete="off"
                value={whatsappToken}
                onChange={(e) => setWhatsappToken(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="Pegá tu System User Access Token"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="whatsapp-template-name"
                className="block text-[13px] font-medium text-zinc-500"
              >
                Template del recordatorio (opcional)
              </label>
              <input
                id="whatsapp-template-name"
                name="whatsappTemplateName"
                type="text"
                autoComplete="off"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="crow_recordatorio"
              />
              <p className="text-[12px] leading-relaxed text-zinc-500">
                En Meta, este template debe tener dos variables en el cuerpo
                (nombre y evento) y un botón de sitio web dinámico llamado
                <span className="text-zinc-400"> Ir al evento</span>. Configurá su URL
                como <span className="font-mono text-zinc-400">https://crow.ar/{"{{1}}"}</span>;
                el enlace no va escrito dentro del mensaje.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="min-w-[160px] rounded-xl border-0 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Validando…
                  </>
                ) : (
                  "Guardar y conectar"
                )}
              </Button>
              {connected && editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  disabled={submitting}
                  onClick={() => {
                    setEditing(false)
                    setPhone("")
                    setPhoneNumberId("")
                    setWhatsappToken("")
                    setTemplateName("")
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
