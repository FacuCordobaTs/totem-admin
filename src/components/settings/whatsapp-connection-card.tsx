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

/**
 * Estado del WhatsApp de la plataforma. Las credenciales de Meta (token y número) viven en el
 * `.env` del VPS y las administra Crow, así que la productora no carga nada: acá sólo se ve con
 * qué número salen los mensajes y se puede mandar una prueba.
 */
export function WhatsAppConnectionCard({
  tenantId,
  token,
  className,
}: WhatsAppConnectionCardProps) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testNumber, setTestNumber] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

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
        ) : connected ? (
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
            <p className="text-[12px] leading-relaxed text-zinc-500">
              El número y las credenciales son de Crow: los mensajes de todas las
              productoras salen desde el mismo WhatsApp Business y no tenés que cargar
              tokens de Meta. Si necesitás otro número, escribinos.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                onClick={() => setTesting((v) => !v)}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Enviar mensaje de prueba
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
          <div className="space-y-3">
            <Badge
              variant="outline"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-amber-400 shadow-none"
            >
              Todavía no disponible
            </Badge>
            <p className="text-[15px] leading-relaxed text-zinc-300">
              Crow está terminando de habilitar el envío de WhatsApp de la plataforma.
              Cuando esté listo, los recordatorios, los códigos de acceso y los avisos a
              tus clientes salen solos desde el WhatsApp de Crow.
            </p>
            <p className="text-[12px] leading-relaxed text-zinc-500">
              No tenés que cargar ningún token de Meta.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
