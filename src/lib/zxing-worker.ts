/**
 * Web Worker de decodificación: corre `zxing-wasm` fuera del hilo principal.
 *
 * Así el loop de captura no se bloquea mientras el wasm trabaja (la UI y el video siguen a
 * 60 fps) y se puede decodificar sin intervalo artificial: el próximo frame se captura apenas
 * el worker termina el anterior.
 */
import { DNI_OPTIONS, QR_DEEP_OPTIONS, QR_FAST_OPTIONS, readBarcodes, zxingReady } from "./zxing-engine"
import type { ReaderOptions } from "./zxing-engine"

export type DecodePreset = "fast" | "deep" | "dni"

/** Un recorte del frame ya escalado, con el preset con el que se decodifica. */
export type DecodeJob = {
  width: number
  height: number
  buffer: ArrayBuffer
  preset: DecodePreset
}

/** Varios recortes/escalas del mismo frame: se prueban en orden hasta que uno lea. */
export type DecodeRequest = { id: number; jobs: DecodeJob[] }

export type DecodeResponse = { id: number; text: string | null; error?: string }

const PRESETS: Record<DecodePreset, ReaderOptions> = {
  fast: QR_FAST_OPTIONS,
  deep: QR_DEEP_OPTIONS,
  dni: DNI_OPTIONS,
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<DecodeRequest>) => void) | null
  postMessage: (msg: DecodeResponse) => void
}

ctx.onmessage = async (ev) => {
  const { id, jobs } = ev.data
  try {
    await zxingReady
    for (const job of jobs) {
      const image = new ImageData(new Uint8ClampedArray(job.buffer), job.width, job.height)
      const results = await readBarcodes(image, PRESETS[job.preset])
      const text = results[0]?.text?.trim()
      if (text) {
        ctx.postMessage({ id, text })
        return
      }
    }
    ctx.postMessage({ id, text: null })
  } catch (err) {
    ctx.postMessage({
      id,
      text: null,
      error: err instanceof Error ? err.message : "No se pudo iniciar el lector de códigos",
    })
  }
}
