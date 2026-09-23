use std::fs::{self, File};
use std::io::Write;
#[cfg(windows)]
use std::ptr::null_mut;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
#[cfg(windows)]
use widestring::U16CString;

struct PrintQueue(Mutex<()>);

/// Opción virtual visible en el selector de impresoras. En vez de enviar los
/// bytes a un dispositivo, conserva el trabajo RAW y una vista HTML legible.
const DEBUG_PRINTER_NAME: &str = "DEBUG - guardar HTML y ESC-POS";
const LEGACY_DEBUG_PRINTER_NAME: &str = "GUARDAR EN ARCHIVO (DEBUG)";

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{GetLastError, BOOL, FALSE, HANDLE},
    Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_DEFAULTSW, PRINTER_ENUM_LOCAL,
        PRINTER_INFO_2W,
    },
};

#[tauri::command]
fn get_printers() -> Vec<String> {
    let mut list = Vec::new();
    if let Ok(ports) = serialport::available_ports() {
        for port in ports {
            list.push(port.port_name);
        }
    }
    #[cfg(windows)]
    {
        list.extend(get_printers_windows());
    }
    list.push(DEBUG_PRINTER_NAME.to_string());
    list
}

#[cfg(windows)]
fn get_printers_windows() -> Vec<String> {
    let mut printers = Vec::new();
    let mut bytes_needed: u32 = 0;
    let mut num_printers: u32 = 0;
    unsafe {
        EnumPrintersW(
            PRINTER_ENUM_LOCAL,
            null_mut(),
            2,
            null_mut(),
            0,
            &mut bytes_needed,
            &mut num_printers,
        );
    }
    if bytes_needed == 0 {
        return printers;
    }
    let mut buffer: Vec<u8> = vec![0; bytes_needed as usize];
    unsafe {
        let result = EnumPrintersW(
            PRINTER_ENUM_LOCAL,
            null_mut(),
            2,
            buffer.as_mut_ptr(),
            bytes_needed,
            &mut bytes_needed,
            &mut num_printers,
        );
        if result != FALSE && num_printers > 0 {
            let printer_info = buffer.as_ptr() as *const PRINTER_INFO_2W;
            for i in 0..num_printers as isize {
                let info = &*printer_info.offset(i);
                if !info.pPrinterName.is_null() {
                    let mut len = 0;
                    while *info.pPrinterName.add(len) != 0 {
                        len += 1;
                    }
                    let slice = std::slice::from_raw_parts(info.pPrinterName, len);
                    if let Ok(name) = String::from_utf16(slice) {
                        printers.push(name);
                    }
                }
            }
        }
    }
    printers
}

#[tauri::command]
fn send_print_job(
    app: AppHandle,
    printer_name: String,
    content: Vec<u8>,
    print_queue: State<'_, PrintQueue>,
) -> Result<(), String> {
    let _guard = print_queue
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if printer_name == DEBUG_PRINTER_NAME || printer_name == LEGACY_DEBUG_PRINTER_NAME {
        return save_debug_print_job(&app, &content);
    }
    if printer_name.to_uppercase().starts_with("COM") {
        let mut port = serialport::new(&printer_name, 9600)
            .timeout(Duration::from_millis(2000))
            .open()
            .map_err(|e| format!("Error abriendo puerto serial {}: {}", printer_name, e))?;
        return port
            .write_all(&content)
            .map_err(|e| format!("Error escribiendo en puerto serial: {}", e));
    }
    #[cfg(windows)]
    {
        send_print_job_windows(&printer_name, &content)
    }
    #[cfg(not(windows))]
    {
        Err("Impresión real solo soportada en Windows".to_string())
    }
}

/// Guarda ambos formatos en Documentos/Crow Debug Prints. El `.escpos` es el
/// flujo exacto que recibiría una térmica y se puede abrir en un visor ESC/POS;
/// el `.html` permite revisar la comanda directamente en cualquier navegador.
fn save_debug_print_job(app: &AppHandle, content: &[u8]) -> Result<(), String> {
    let base_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No se pudo obtener una carpeta para la impresión de debug: {e}"))?;
    let output_dir = base_dir.join("Crow Debug Prints");
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("No se pudo crear la carpeta de debug: {e}"))?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("No se pudo generar el nombre del archivo: {e}"))?
        .as_millis();
    let base_name = format!("comanda-{stamp}");
    let raw_path = output_dir.join(format!("{base_name}.escpos"));
    let html_path = output_dir.join(format!("{base_name}.html"));

    let mut raw_file =
        File::create(&raw_path).map_err(|e| format!("No se pudo crear el archivo ESC/POS: {e}"))?;
    raw_file
        .write_all(content)
        .map_err(|e| format!("No se pudo escribir el archivo ESC/POS: {e}"))?;

    fs::write(&html_path, render_debug_preview(content))
        .map_err(|e| format!("No se pudo crear la vista previa HTML: {e}"))?;
    Ok(())
}

/// Encoder QR vendorizado desde `qrcode.react` (Project Nayuki, MIT): el mismo con el que el
/// admin dibuja los QR que se escanean en producción. Se copia en vez de importarse porque esta
/// vista previa es un HTML autónomo que se abre desde el disco, sin bundler y sin red: los
/// payloads son capabilities y no pueden salir a un servicio externo para "generar la imagen".
const DEBUG_PREVIEW_QR_ENCODER_JS: &str = include_str!("debug-preview-qr.js");

/// Dibuja cada `.qr-canvas[data-payload]` como SVG, replicando el comando `GS ( k` que emite
/// `printerUtils.ts`: modelo 2, byte mode, ECC M, versión y máscara automáticas. Sin `boostEcl`,
/// para que el patrón sea el mismo que el de la térmica. El payload se lee del atributo como
/// dato y nunca se interpola en el markup.
const DEBUG_PREVIEW_QR_RENDERER_JS: &str = r##"(function () {
  var canvases = document.querySelectorAll(".qr-canvas[data-payload]");
  for (var c = 0; c < canvases.length; c++) {
    var payload = canvases[c].getAttribute("data-payload") || "";
    var bytes = [];
    for (var i = 0; i < payload.length; i++) bytes.push(payload.charCodeAt(i) & 0xff);
    var qr;
    try {
      qr = qrcodegen.QrCode.encodeSegments(
        [qrcodegen.QrSegment.makeBytes(bytes)],
        qrcodegen.QrCode.Ecc.MEDIUM, 1, 40, -1, false
      );
    } catch (error) {
      continue;
    }
    var margin = 4;
    var span = qr.size + margin * 2;
    var ops = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) ops.push("M" + (x + margin) + " " + (y + margin) + "h1v1h-1z");
      }
    }
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + span + " " + span);
    svg.setAttribute("shape-rendering", "crispEdges");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ops.join(""));
    path.setAttribute("fill", "#000");
    svg.appendChild(path);
    canvases[c].appendChild(svg);
    var figure = canvases[c].parentNode;
    var fallback = figure ? figure.querySelector(".qr-fallback") : null;
    if (fallback) fallback.hidden = true;
  }
})();"##;

const DEBUG_PREVIEW_CSS: &str = r##"body{margin:0;background:#f4f4f4;font-family:Arial,sans-serif}main{width:58mm;margin:24px auto;padding:7mm;background:#fff;box-shadow:0 2px 12px #0003}h1{font-size:12px;margin:0 0 5mm;text-align:center}p{font-size:9px;color:#555;line-height:1.4}pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.35 'Courier New',monospace;color:#000}figure.qr{margin:5mm 0;display:flex;justify-content:center}figure.qr .qr-fallback{font:12px/1.35 'Courier New',monospace;color:#000}figure.qr svg{width:40mm;height:40mm}@media print{body{background:#fff}main{margin:0;box-shadow:none}figure.qr{break-inside:avoid}}"##;

/// Intérprete deliberadamente pequeño del subconjunto ESC/POS que genera
/// `printerUtils.ts`: texto, saltos de línea y los payloads de QR. No sustituye
/// al archivo RAW; existe exclusivamente para que la comanda sea inspeccionable.
///
/// Los payloads de QR se emiten como un `<figure>` con un SVG que dibuja el script embebido, más
/// el texto `[QR: ...]` como respaldo (sin JS, o si el encoder falla, se sigue leyendo el token).
/// El marcado se arma escapando cada tramo de texto al agregarlo: nunca se interpola contenido
/// del RAW sin escapar.
fn render_debug_preview(content: &[u8]) -> String {
    let mut text = String::new();
    let mut body = String::new();
    let mut index = 0;

    while index < content.len() {
        match content[index] {
            // Comandos ESC/POS de tres bytes usados por la app: alineación,
            // negrita y tamaño de fuente. La vista HTML conserva el contenido.
            0x1b if index + 2 < content.len() && matches!(content[index + 1], 0x61 | 0x45) => {
                index += 3
            }
            0x1d if index + 2 < content.len() && matches!(content[index + 1], 0x21 | 0x56) => {
                index += 3
            }
            0x1b if index + 1 < content.len() && content[index + 1] == 0x40 => index += 2,
            // GS ( k pL pH cn fn m [payload]. Solo se muestra el dato de QR
            // almacenado por la secuencia `31 50 30`; los otros subcomandos se
            // omiten porque son configuración e impresión del mismo código.
            0x1d if index + 7 < content.len()
                && content[index + 1] == 0x28
                && content[index + 2] == 0x6b =>
            {
                let length = content[index + 3] as usize | ((content[index + 4] as usize) << 8);
                let command_end = index.saturating_add(5 + length);
                if length >= 3
                    && command_end <= content.len()
                    && content[index + 5] == 0x31
                    && content[index + 6] == 0x50
                    && content[index + 7] == 0x30
                {
                    let payload = escape_html(&String::from_utf8_lossy(
                        &content[index + 8..command_end],
                    ));
                    flush_text(&mut text, &mut body);
                    body.push_str(r#"<figure class="qr"><span class="qr-fallback">[QR: "#);
                    body.push_str(&payload);
                    body.push_str(r#"]</span><div class="qr-canvas" data-payload=""#);
                    body.push_str(&payload);
                    body.push_str(r#""></div></figure>"#);
                }
                index = command_end;
            }
            b'\n' => {
                text.push('\n');
                index += 1;
            }
            b'\r' => index += 1,
            byte if byte >= 0x20 => {
                text.push(byte as char);
                index += 1;
            }
            _ => index += 1,
        }
    }
    flush_text(&mut text, &mut body);

    format!(
        r#"<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Vista previa de comanda</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>{css}</style>
</head><body><main><h1>COMANDA — VISTA PREVIA</h1><p>Archivo generado por la impresora de debug de Crow. El archivo .escpos homónimo contiene los bytes RAW originales para un visor o impresora ESC/POS.</p>{body}</main>
<script>{encoder}</script>
<script>{renderer}</script>
</body></html>"#,
        css = DEBUG_PREVIEW_CSS,
        body = body,
        encoder = DEBUG_PREVIEW_QR_ENCODER_JS,
        renderer = DEBUG_PREVIEW_QR_RENDERER_JS,
    )
}

/// Vuelca el texto acumulado como un `<pre>` y lo limpia, para poder intercalar los QR en su
/// posición dentro de la comanda. El `pre-wrap` hace que varios `<pre>` seguidos se vean igual
/// que uno solo.
fn flush_text(text: &mut String, body: &mut String) {
    if text.is_empty() {
        return;
    }
    body.push_str("<pre>");
    body.push_str(&escape_html(text));
    body.push_str("</pre>");
    text.clear();
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::render_debug_preview;

    /// Secuencia `GS ( k` completa como la emite `qrCodeCommand`: modelo 2, módulo, ECC M,
    /// guardar datos (lo único que interpreta el preview) e imprimir.
    fn qr_commands(payload: &str) -> Vec<u8> {
        let mut bytes = vec![0x1d, 0x28, 0x6b];
        let length = payload.len() + 3;
        bytes.push((length & 0xff) as u8);
        bytes.push(((length >> 8) & 0xff) as u8);
        bytes.extend_from_slice(&[0x31, 0x50, 0x30]);
        bytes.extend_from_slice(payload.as_bytes());
        bytes.extend_from_slice(&[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
        bytes
    }

    #[test]
    fn debug_preview_keeps_text_and_qr_payload_safe_for_html() {
        let bytes = [
            0x1b, 0x40, b'<', b'C', b'R', b'O', b'W', b'>', b'\n', 0x1d, 0x28, 0x6b, 0x06, 0x00,
            0x31, 0x50, 0x30, b'Q', b'R', b'1',
        ];

        let preview = render_debug_preview(&bytes);

        assert!(preview.contains("&lt;CROW&gt;"));
        assert!(preview.contains("[QR: QR1]"));
    }

    #[test]
    fn debug_preview_exposes_the_qr_payload_and_an_offline_encoder() {
        let token = "2f1c9d4e-6a7b-4c0e-9f21-0d3e5a7b8c90";
        let mut bytes = vec![0x1b, 0x40];
        bytes.extend_from_slice(&qr_commands(token));

        let preview = render_debug_preview(&bytes);

        // El payload queda disponible como dato para el renderer y como texto de respaldo.
        assert!(preview.contains(&format!(r#"data-payload="{token}""#)));
        assert!(preview.contains(&format!("[QR: {token}]")));
        // El encoder viaja embebido y el CSP corta toda salida a la red: los tokens son
        // capabilities y no pueden salir a un servicio externo que dibuje el QR.
        assert!(preview.contains("Project Nayuki"));
        assert!(preview.contains("qrcodegen.QrSegment.makeBytes"));
        assert!(preview.contains("default-src 'none'"));
        // Ningún recurso externo: el QR se dibuja con el encoder embebido, no con una imagen.
        assert!(!preview.contains("<img"));
        assert!(!preview.contains("src="));
    }

    #[test]
    fn debug_preview_escapes_qr_payloads_instead_of_injecting_markup() {
        let mut bytes = vec![0x1b, 0x40];
        bytes.extend_from_slice(&qr_commands(r#""><script>alert(1)</script>"#));

        let preview = render_debug_preview(&bytes);

        assert!(!preview.contains("<script>alert(1)</script>"));
        assert!(!preview.contains(r#""><script"#));
        assert!(preview.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
    }
}

#[cfg(windows)]
fn send_print_job_windows(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let printer_name_wide = U16CString::from_str(printer_name)
        .map_err(|_| "Nombre de impresora inválido".to_string())?;
    let mut printer_handle: HANDLE = std::ptr::null_mut();
    unsafe {
        let mut defaults = PRINTER_DEFAULTSW {
            pDatatype: null_mut(),
            pDevMode: null_mut(),
            DesiredAccess: 0,
        };
        let result: BOOL = OpenPrinterW(
            printer_name_wide.as_ptr() as *mut _,
            &mut printer_handle,
            &mut defaults,
        );
        if result == FALSE {
            let error = GetLastError();
            return Err(format!(
                "No se pudo abrir la impresora '{}'. Error: {}",
                printer_name, error
            ));
        }
    }
    let doc_name_wide = U16CString::from_str("Tauri RAW Print").unwrap();
    let data_type_wide = U16CString::from_str("RAW").unwrap();
    let doc_info = DOC_INFO_1W {
        pDocName: doc_name_wide.as_ptr() as *mut _,
        pOutputFile: null_mut(),
        pDatatype: data_type_wide.as_ptr() as *mut _,
    };
    unsafe {
        let job_id = StartDocPrinterW(printer_handle, 1, &doc_info as *const DOC_INFO_1W);
        if job_id == 0 {
            let error = GetLastError();
            ClosePrinter(printer_handle);
            return Err(format!("No se pudo iniciar el documento. Error: {}", error));
        }
        let start_page_result: BOOL = StartPagePrinter(printer_handle);
        if start_page_result == FALSE {
            let error = GetLastError();
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!("No se pudo iniciar la página. Error: {}", error));
        }
        let mut bytes_written: u32 = 0;
        let write_result: BOOL = WritePrinter(
            printer_handle,
            content.as_ptr() as *const _,
            content.len() as u32,
            &mut bytes_written,
        );
        if write_result == FALSE {
            let error = GetLastError();
            EndPagePrinter(printer_handle);
            EndDocPrinter(printer_handle);
            ClosePrinter(printer_handle);
            return Err(format!(
                "Error al escribir en la impresora. Error: {}",
                error
            ));
        }
        EndPagePrinter(printer_handle);
        EndDocPrinter(printer_handle);
        ClosePrinter(printer_handle);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PrintQueue(Mutex::new(())))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_printers, send_print_job])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
