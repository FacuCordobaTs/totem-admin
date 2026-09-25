import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { getCurrentWindow } from "@tauri-apps/api/window"

/**
 * Zoom del webview en el host Tauri. Los gestos (Ctrl + rueda, Ctrl + +, Ctrl + -) son nativos:
 * los habilita `zoomHotkeysEnabled` en `tauri.conf.json`. Este módulo sólo conserva el nivel
 * elegido entre arranques, porque WebView2 aplica el zoom del usuario a la página actual y no lo
 * persiste. Fuera de Tauri no hace nada: en el navegador el zoom es del navegador y ya se
 * recuerda por origen.
 */

/** Misma convención que `crow_printer_name`. */
const STORAGE_KEY = "crow_window_zoom"

/** Límites del zoom que acepta WebView2; un valor guardado fuera de rango está corrupto. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

/** El zoom del webview dispara `resize`; se espera a que termine la ráfaga antes de medir. */
const MEASURE_DELAY_MS = 300

/** Tolerancia de comparación: WebView2 devuelve niveles como 0.67 y la medición es un cociente. */
const ZOOM_EPSILON = 0.005

function readStoredZoom(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= MIN_ZOOM && value <= MAX_ZOOM ? value : null
  } catch {
    return null
  }
}

function storeZoom(zoom: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(zoom))
  } catch {
    /* sin persistencia */
  }
}

/**
 * Nivel de zoom real del webview, medido contra el sistema y no contra `devicePixelRatio`: el
 * webview ocupa el área cliente de la ventana, así que `ancho físico / (ancho CSS × escalado del
 * monitor)` es el zoom. Con `devicePixelRatio` alcanzaría, pero mudar la ventana a un monitor con
 * otro escalado se leería como un zoom que nadie pidió.
 *
 * `window.innerWidth` y `innerSize()` incluyen la misma canaleta de scrollbar, así que comparan.
 */
async function measureZoom(): Promise<number | null> {
  const viewportWidth = window.innerWidth
  if (viewportWidth <= 0) return null
  try {
    const appWindow = getCurrentWindow()
    const [scaleFactor, innerSize] = await Promise.all([
      appWindow.scaleFactor(),
      appWindow.innerSize(),
    ])
    if (scaleFactor <= 0) return null
    return innerSize.width / (viewportWidth * scaleFactor)
  } catch {
    return null
  }
}

/**
 * Segundo disparador de la medición: si el zoom cambia sin mover el layout, `resize` puede no
 * llegar. El `matchMedia` se rearma con cada valor porque la consulta es sobre un DPR exacto.
 */
function watchDevicePixelRatio(onChange: () => void): void {
  let query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const handleChange = () => {
    query.removeEventListener("change", handleChange)
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    query.addEventListener("change", handleChange)
    onChange()
  }
  query.addEventListener("change", handleChange)
}

/**
 * Restaura el zoom guardado y lo vuelve a guardar cuando cambia. Se llama una sola vez, antes de
 * montar la aplicación.
 */
export function initWindowZoom(): void {
  if (!isTauri()) return

  const stored = readStoredZoom()
  let applied = stored ?? 1
  const restore =
    stored !== null && stored !== 1
      ? getCurrentWebview()
          .setZoom(stored)
          .catch((error) => console.error("No se pudo restaurar el zoom de la ventana:", error))
      : Promise.resolve()

  let timer: ReturnType<typeof setTimeout> | undefined
  const measureSoon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void measureZoom().then((measured) => {
        if (measured === null) return
        const zoom = Math.round(measured * 1000) / 1000
        // La medición es un cociente y `resize` también llega por redimensionar la ventana:
        // sólo se guarda un cambio real de nivel.
        if (Math.abs(zoom - applied) < ZOOM_EPSILON) return
        applied = zoom
        storeZoom(zoom)
      })
    }, MEASURE_DELAY_MS)
  }

  // Los disparadores se enganchan recién cuando el zoom restaurado ya está aplicado: una medición
  // anterior guardaría el 100 % del arranque y borraría la preferencia.
  void restore.finally(() => {
    window.addEventListener("resize", measureSoon)
    watchDevicePixelRatio(measureSoon)
  })
}
