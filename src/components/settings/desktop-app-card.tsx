import { useCallback, useEffect, useState } from "react"
import { Download, Monitor } from "lucide-react"
import { getUpdatesManifestUrl, parseLatestManifest, type DesktopRelease } from "@/lib/desktop-app-download"
import { AccountSection, AccountLoading, AccountLoadError } from "./account-section"

/** Browser-only download. The current installer URL comes from the published update manifest. */
export function DesktopAppCard() {
  const [release, setRelease] = useState<DesktopRelease | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(getUpdatesManifestUrl(), { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const parsed = parseLatestManifest(await res.json())
      if (!parsed) throw new Error("Manifiesto sin instalador para Windows")
      setRelease(parsed)
    } catch { setRelease(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <AccountSection title="Crow para Windows" description="Impresión directa y lectores USB para operar tu evento." icon={Monitor}
      status={!loading && release ? <span className="account-status">Versión {release.version}</span> : undefined}>
      {loading ? <AccountLoading /> : release ? (
        <div className="account-desktop">
          <p>Instalá Crow en la computadora del puesto para imprimir comandas, tickets y cierres en la impresora térmica y escanear con un lector USB.</p>
          <div className="account-actions">
            <a href={release.downloadUrl} target="_blank" rel="noreferrer" className="account-button account-button-primary"><Download aria-hidden="true" />Descargar para Windows</a>
            <button type="button" className="account-button account-button-secondary" onClick={() => void load()}>Buscar de nuevo</button>
          </div>
          <p className="account-note">Al abrir el instalador, Windows puede pedirte confirmación para instalar.</p>
          {release.notes ? <section className="account-release-notes"><h4>Novedades de esta versión</h4><p>{release.notes}</p></section> : null}
        </div>
      ) : <AccountLoadError service="la última versión de Crow" onRetry={() => void load()} />}
    </AccountSection>
  )
}
