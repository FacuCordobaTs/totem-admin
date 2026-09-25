import { useCallback, useEffect, useRef, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import type { Update } from "@tauri-apps/plugin-updater"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

// Una compu de productora puede quedar prendida días enteros, así que se revisa al
// arrancar y cada tanto. Descargar e instalar lo decide una persona: reiniciar solo
// en medio de una venta o de un cierre de caja sería peor que quedar desactualizado.
const FIRST_CHECK_DELAY_MS = 3000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const DISMISSED_VERSION_KEY = "crow_updater_dismissed_version"

interface AvailableUpdate {
  version: string
  notes: string | null
}

export function UpdateChecker() {
  // El Update tiene que sobrevivir entre el check y el install, y hay que cerrarlo
  // cuando se descarta: guardarlo en un ref evita re-renders con un recurso vivo.
  const updateRef = useRef<Update | null>(null)
  const [available, setAvailable] = useState<AvailableUpdate | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkForUpdate = useCallback(async () => {
    const { check } = await import("@tauri-apps/plugin-updater")
    const found = await check()
    if (!found) return
    // Descartar una versión no silencia la siguiente.
    if (localStorage.getItem(DISMISSED_VERSION_KEY) === found.version) {
      await found.close()
      return
    }
    updateRef.current = found
    setAvailable({ version: found.version, notes: found.body ?? null })
  }, [])

  useEffect(() => {
    // En el navegador (Cloudflare Pages) no hay updater: el import dinámico mantiene
    // el plugin fuera del bundle web y acá se corta antes de tocarlo.
    if (!isTauri()) return
    let cancelled = false

    const run = async () => {
      try {
        await checkForUpdate()
      } catch (cause) {
        // Sin red o endpoint caído no es algo que el usuario tenga que resolver.
        if (!cancelled) console.warn("No se pudo verificar actualizaciones:", cause)
      }
    }

    const timer = window.setTimeout(run, FIRST_CHECK_DELAY_MS)
    const interval = window.setInterval(run, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [checkForUpdate])

  const install = useCallback(async () => {
    const found = updateRef.current
    if (!found) return
    setError(null)
    setProgress(0)
    try {
      let total = 0
      let received = 0
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0
        } else if (event.event === "Progress") {
          received += event.data.chunkLength
          // El 100 se reserva para "Finished": significa instalado, no descargado.
          if (total > 0) setProgress(Math.min(99, Math.round((received / total) * 100)))
        } else {
          setProgress(100)
        }
      })
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    } catch (cause) {
      setProgress(null)
      setError(cause instanceof Error ? cause.message : "No se pudo instalar la actualización")
    }
  }, [])

  const dismiss = useCallback(() => {
    const found = updateRef.current
    if (found) localStorage.setItem(DISMISSED_VERSION_KEY, found.version)
    updateRef.current = null
    setAvailable(null)
    setProgress(null)
    setError(null)
  }, [])

  if (!available) return null

  const installing = progress !== null

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
      <p className="text-sm font-medium">Nueva versión {available.version}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {progress === null
          ? "Actualizá cuando termines lo que estás haciendo."
          : progress >= 100
            ? "Instalando y reiniciando…"
            : `Descargando… ${progress}%`}
      </p>
      {available.notes && !installing ? (
        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{available.notes}</p>
      ) : null}
      {installing ? <Progress className="mt-3" value={progress} /> : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={installing}>
          Ahora no
        </Button>
        <Button size="sm" onClick={install} disabled={installing}>
          Actualizar
        </Button>
      </div>
    </div>
  )
}
