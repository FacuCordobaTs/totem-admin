use std::fs::File;
use std::io::Write;
#[cfg(windows)]
use std::ptr::null_mut;
use std::sync::Mutex;
use std::time::Duration;
#[cfg(windows)]
use widestring::U16CString;
use tauri::State;

struct PrintQueue(Mutex<()>);

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
    list.push("GUARDAR EN ARCHIVO (DEBUG)".to_string());
    list
}

#[cfg(windows)]
fn get_printers_windows() -> Vec<String> {
    let mut printers = Vec::new();
    let mut bytes_needed: u32 = 0;
    let mut num_printers: u32 = 0;
    unsafe {
        EnumPrintersW(PRINTER_ENUM_LOCAL, null_mut(), 2, null_mut(), 0, &mut bytes_needed, &mut num_printers);
    }
    if bytes_needed == 0 { return printers; }
    let mut buffer: Vec<u8> = vec![0; bytes_needed as usize];
    unsafe {
        let result = EnumPrintersW(PRINTER_ENUM_LOCAL, null_mut(), 2, buffer.as_mut_ptr(), bytes_needed, &mut bytes_needed, &mut num_printers);
        if result != FALSE && num_printers > 0 {
            let printer_info = buffer.as_ptr() as *const PRINTER_INFO_2W;
            for i in 0..num_printers as isize {
                let info = &*printer_info.offset(i);
                if !info.pPrinterName.is_null() {
                    let mut len = 0;
                    while *info.pPrinterName.add(len) != 0 { len += 1; }
                    let slice = std::slice::from_raw_parts(info.pPrinterName, len);
                    if let Ok(name) = String::from_utf16(slice) { printers.push(name); }
                }
            }
        }
    }
    printers
}

#[tauri::command]
fn send_print_job(printer_name: String, content: Vec<u8>, print_queue: State<'_, PrintQueue>) -> Result<(), String> {
    let _guard = print_queue.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if printer_name == "GUARDAR EN ARCHIVO (DEBUG)" {
        let path = "ticket_debug.bin";
        return match File::create(path) {
            Ok(mut file) => { file.write_all(&content).map_err(|e| format!("Error escribiendo archivo: {}", e))?; Ok(()) }
            Err(e) => Err(format!("No se pudo crear el archivo: {}", e)),
        };
    }
    if printer_name.to_uppercase().starts_with("COM") {
        let mut port = serialport::new(&printer_name, 9600).timeout(Duration::from_millis(2000)).open().map_err(|e| format!("Error abriendo puerto serial {}: {}", printer_name, e))?;
        return port.write_all(&content).map_err(|e| format!("Error escribiendo en puerto serial: {}", e));
    }
    #[cfg(windows)]
    { send_print_job_windows(&printer_name, &content) }
    #[cfg(not(windows))]
    { Err("Impresión real solo soportada en Windows".to_string()) }
}

#[cfg(windows)]
fn send_print_job_windows(printer_name: &str, content: &[u8]) -> Result<(), String> {
    let printer_name_wide = U16CString::from_str(printer_name).map_err(|_| "Nombre de impresora inválido".to_string())?;
    let mut printer_handle: HANDLE = std::ptr::null_mut();
    unsafe {
        let mut defaults = PRINTER_DEFAULTSW { pDatatype: null_mut(), pDevMode: null_mut(), DesiredAccess: 0 };
        let result: BOOL = OpenPrinterW(printer_name_wide.as_ptr() as *mut _, &mut printer_handle, &mut defaults);
        if result == FALSE { let error = GetLastError(); return Err(format!("No se pudo abrir la impresora '{}'. Error: {}", printer_name, error)); }
    }
    let doc_name_wide = U16CString::from_str("Tauri RAW Print").unwrap();
    let data_type_wide = U16CString::from_str("RAW").unwrap();
    let doc_info = DOC_INFO_1W { pDocName: doc_name_wide.as_ptr() as *mut _, pOutputFile: null_mut(), pDatatype: data_type_wide.as_ptr() as *mut _ };
    unsafe {
        let job_id = StartDocPrinterW(printer_handle, 1, &doc_info as *const DOC_INFO_1W);
        if job_id == 0 { let error = GetLastError(); ClosePrinter(printer_handle); return Err(format!("No se pudo iniciar el documento. Error: {}", error)); }
        let start_page_result: BOOL = StartPagePrinter(printer_handle);
        if start_page_result == FALSE { let error = GetLastError(); EndDocPrinter(printer_handle); ClosePrinter(printer_handle); return Err(format!("No se pudo iniciar la página. Error: {}", error)); }
        let mut bytes_written: u32 = 0;
        let write_result: BOOL = WritePrinter(printer_handle, content.as_ptr() as *const _, content.len() as u32, &mut bytes_written);
        if write_result == FALSE { let error = GetLastError(); EndPagePrinter(printer_handle); EndDocPrinter(printer_handle); ClosePrinter(printer_handle); return Err(format!("Error al escribir en la impresora. Error: {}", error)); }
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
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_printers, send_print_job])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
