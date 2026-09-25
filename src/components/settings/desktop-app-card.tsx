import { useCallback, useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  getUpdatesManifestUrl,
  parseLatestManifest,
  type DesktopRelease,
} from "@/lib/desktop-app-download"
import { cn } from "@/lib/utils"

type DesktopAppCardProps = {
  className?: string
}

/**
 * Descarga del instalador de Windows desde el navegador. El enlace no se escribe acá: sale del
 * mismo `latest.json` que firma el updater, así que publicar un release no requiere tocar el
 * frontend. Dentro de Tauri la tarjeta no se muestra: ya se está usando la app de escritorio.
 */
export function DesktopAppCard({ className }: DesktopAppCardProps) {
  const [release, setRelease] = useState<DesktopRelease | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // El manifiesto se republica con cada release: nada de caché del navegador.
      const res = await fetch(getUpdatesManifestUrl(), { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const parsed = parseLatestManifest(await res.json())
      if (!parsed) throw new Error("Manifiesto sin instalador para Windows")
      setRelease(parsed)
    } catch (cause) {
      console.warn("No se pudo leer la última versión publicada:", cause)
      setRelease(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
          App de escritorio
        </CardTitle>
        <CardDescription className="text-zinc-500 dark:text-zinc-500">
          Crow para Windows, con impresión directa a la impresora térmica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Buscando la última versión…
          </p>
        ) : release ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300 shadow-none"
              >
                Versión {release.version}
              </Badge>
            </div>
            <p className="text-[15px] leading-relaxed text-zinc-300">
              Imprime comandas, tickets y cierres en la térmica y escanea con lector USB. En
              el navegador esas funciones no están disponibles.
            </p>
            {release.notes ? (
              <p className="text-[13px] leading-relaxed text-zinc-500">{release.notes}</p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="min-w-[200px] rounded-xl bg-[#FF9500] text-white hover:bg-[#FF9500]/90"
              >
                {/* En pestaña nueva: si el instalador todavía no está publicado, el 404 no se
                    lleva puesta la sesión del admin. */}
                <a href={release.downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  Descargar para Windows
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => void load()}
              >
                Buscar de nuevo
              </Button>
            </div>
            <p className="text-[12px] leading-relaxed text-zinc-500">
              Al abrirla, Windows puede pedirte confirmación para instalar. Después se
              actualiza sola manteniendo esta misma sesión.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-amber-400 shadow-none"
            >
              No pudimos consultar la versión
            </Badge>
            <p className="text-[15px] leading-relaxed text-zinc-300">
              No se pudo leer el manifiesto de descargas. Revisá la conexión e intentá de
              nuevo.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              onClick={() => void load()}
            >
              Reintentar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
