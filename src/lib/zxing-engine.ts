/**
 * Motor único de decodificación de códigos para el admin (POS y puerta).
 *
 * Regla: **sólo este archivo importa `zxing-wasm`**. El resto del admin importa de acá.
 * Así hay una sola instancia del wasm inicializada, un solo lugar donde viven los presets
 * de opciones, y un único punto a cambiar si algún día hay que moverlo a un Web Worker.
 *
 * El binario se sirve desde nuestro propio origen (import `?url` de Vite) en lugar del CDN
 * que usa `zxing-wasm` por defecto: la puerta tiene que escanear en un venue que puede no
 * tener internet, y la app empaquetada en Tauri tiene que arrancar offline.
 */
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader"
import type { ReaderOptions, ReadResult } from "zxing-wasm/reader"
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"

export { readBarcodes }
export type { ReaderOptions, ReadResult }

/**
 * `fireImmediately: true` tiene que ir en el literal inline: con una variable TypeScript
 * resuelve el overload que devuelve `void` y se pierde la promesa.
 */
export const zxingReady: Promise<unknown> = prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : `${prefix}${path}`,
  },
  fireImmediately: true,
})

/**
 * Pase rápido: QR únicamente, sin heurísticas costosas. Es el que corre en la mayoría de los
 * frames (~20/s) y el que define la latencia percibida.
 *
 * - `formats: ["QRCode"]`: el default de la librería es buscar las 20 simbologías.
 * - `maxNumberOfSymbols: 1`: por defecto busca hasta 255 símbolos en la misma imagen.
 * - `tryHarder: false`: la librería prioriza precisión sobre velocidad por defecto.
 * - `tryRotate: false`: los finder patterns del QR son independientes de la orientación;
 *   esta opción sólo aporta en simbologías lineales (donde sí se activa, ver `DNI_PROFILE`).
 * - `tryDownscale: false`: nosotros ya fijamos la resolución de captura.
 */
export const QR_FAST_OPTIONS: ReaderOptions = {
  formats: ["QRCode"],
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
  maxNumberOfSymbols: 1,
  textMode: "Plain",
}

/**
 * Pase profundo: se ejecuta 1 de cada ~6 intentos cuando el pase rápido no encontró nada.
 *
 * `tryInvert` es la red de seguridad para los QR invertidos que versiones anteriores de la app
 * del cliente siguen mostrando en pantalla. Verificado: un QR `#fafafa` sobre `#121212` da 0%
 * en el pase rápido y 100% acá.
 *
 * `binarizer: "GlobalHistogram"` es una decisión medida, no teórica. El default del pase rápido
 * (`LocalAverage` = HybridBinarizer) falla por completo cuando la imagen **es** el QR y su quiet
 * zone, sin nada de contexto alrededor: el umbral local degenera. Medido sobre 12 imágenes así,
 * `LocalAverage` daba 0% y `GlobalHistogram` 100% en las 12; y con el mismo código un QR de
 * 296 px pasa de 0% a 100%. Sobre frames de cámara reales (QR dentro de un frame 1280×720) los
 * dos dan 100%, así que el pase rápido conserva el default —que es más robusto con luz despareja—
 * y este pase, que sólo corre cuando el rápido ya falló, aporta un binarizer distinto.
 */
export const QR_DEEP_OPTIONS: ReaderOptions = {
  ...QR_FAST_OPTIONS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  binarizer: "GlobalHistogram",
}

/**
 * DNI físico: QR, PDF417 y los códigos de barras 1D de los documentos anteriores.
 *
 * `tryCode39ExtendedMode: false` no es cosmético: es lo que fijaba `barcode-detector` y evita
 * que el DNI numérico se decodifique como Code39 "full ASCII" y rompa `parseDniBarcode`.
 */
export const DNI_OPTIONS: ReaderOptions = {
  formats: ["QRCode", "PDF417", "Code128", "Code39"],
  tryHarder: true,
  tryRotate: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
  tryCode39ExtendedMode: false,
  textMode: "Plain",
}

/** Lado mayor (en px) al que se reduce el frame antes de decodificar, por perfil. */
export const DECODE_MAX_EDGE = {
  qr: 1280,
  dni: 1920,
} as const
