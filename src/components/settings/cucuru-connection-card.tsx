import { useCallback, useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiFetch, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

type CucuruStatus = {
  hasCucuruConfigured: boolean
}

type CucuruConnectionCardProps = {
  tenantId: string | null
  token: string | null
  className?: string
}

export function CucuruConnectionCard({
  tenantId,
  token,
  className,
}: CucuruConnectionCardProps) {
  const [status, setStatus] = useState<CucuruStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [collectorId, setCollectorId] = useState("")

  const load = useCallback(async () => {
    if (!token || !tenantId) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await apiFetch<CucuruStatus>("/tenants/me/cucuru", {
        method: "GET",
        token,
      })
      setStatus(data)
    } catch {
      setStatus(null)
      toast.error("No se pudo cargar el estado de Cucuru")
    } finally {
      setLoading(false)
    }
  }, [token, tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const connected = status?.hasCucuruConfigured === true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    const k = apiKey.trim()
    const c = collectorId.trim()
    if (!k || !c) {
      toast.error("Completá la API Key y el Collector ID.")
      return
    }
    setSubmitting(true)
    try {
      await apiFetch<{ ok: boolean }>("/tenants/me/cucuru", {
        method: "PUT",
        token,
        body: JSON.stringify({
          cucuruApiKey: k,
          cucuruCollectorId: c,
        }),
      })
      toast.success("Cucuru conectado: webhook registrado correctamente")
      setApiKey("")
      setCollectorId("")
      setEditing(false)
      await load()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo guardar la configuración de Cucuru"
      )
    } finally {
      setSubmitting(false)
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
          Cucuru
        </CardTitle>
        <CardDescription className="text-zinc-500 dark:text-zinc-500">
          Transferencias y acreditación vía webhook de cobranzas.
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
            <p className="text-[15px] leading-relaxed text-zinc-300">
              El webhook está registrado con Cucuru para esta productora.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 sm:w-auto"
              onClick={() => setEditing(true)}
            >
              Actualizar credenciales
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {connected && editing ? (
              <p className="text-[13px] text-zinc-500">
                Volvé a ingresar la API Key completa y el Collector ID para actualizar.
              </p>
            ) : null}
            <div className="space-y-2">
              <label
                htmlFor="cucuru-api-key"
                className="block text-[13px] font-medium text-zinc-500"
              >
                API Key
              </label>
              <input
                id="cucuru-api-key"
                name="cucuruApiKey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="Pegá tu API Key"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="cucuru-collector-id"
                className="block text-[13px] font-medium text-zinc-500"
              >
                Collector ID
              </label>
              <input
                id="cucuru-collector-id"
                name="cucuruCollectorId"
                type="text"
                autoComplete="off"
                value={collectorId}
                onChange={(e) => setCollectorId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[15px] text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                placeholder="ID del collector"
              />
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
                    Guardando…
                  </>
                ) : (
                  "Guardar y registrar webhook"
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
                    setApiKey("")
                    setCollectorId("")
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
