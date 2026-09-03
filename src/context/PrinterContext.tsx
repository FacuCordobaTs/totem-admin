import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'crow_printer_name';
const DEBUG_PRINTER_NAME = 'DEBUG - guardar HTML y ESC-POS';
const LEGACY_DEBUG_PRINTER_NAME = 'GUARDAR EN ARCHIVO (DEBUG)';

interface PrinterContextType {
    printers: string[];
    selectedPrinter: string | null;
    refreshPrinters: () => Promise<void>;
    printRaw: (data: number[]) => Promise<void>;
    setSelectedPrinter: (name: string) => void;
}

const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export const PrinterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [printers, setPrinters] = useState<string[]>([]);
    const [selectedPrinter, setSelectedPrinterState] = useState<string | null>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        // La opción anterior generaba un único .bin. Migrarla evita que los
        // equipos que ya la tenían seleccionada pierdan la nueva vista previa.
        if (saved === LEGACY_DEBUG_PRINTER_NAME) {
            localStorage.setItem(STORAGE_KEY, DEBUG_PRINTER_NAME);
            return DEBUG_PRINTER_NAME;
        }
        return saved;
    });
    const setSelectedPrinter = useCallback((name: string) => {
        setSelectedPrinterState(name);
        localStorage.setItem(STORAGE_KEY, name);
    }, []);
    const refreshPrinters = useCallback(async () => {
        try {
            const printerList = await invoke<string[]>('get_printers');
            setPrinters(printerList);
        } catch (error) {
            console.error('Error al obtener impresoras:', error);
        }
    }, []);
    const printRaw = useCallback(async (data: number[]) => {
        if (!selectedPrinter) throw new Error('No hay impresora seleccionada');
        try {
            await invoke('send_print_job', { printerName: selectedPrinter, content: data });
        } catch (error) {
            console.error('Error al imprimir:', error);
            throw error;
        }
    }, [selectedPrinter]);
    useEffect(() => { refreshPrinters(); }, [refreshPrinters]);
    return (
        <PrinterContext.Provider value={{ printers, selectedPrinter, refreshPrinters, printRaw, setSelectedPrinter }}>
            {children}
        </PrinterContext.Provider>
    );
};

export const usePrinter = () => {
    const context = useContext(PrinterContext);
    if (context === undefined) throw new Error('usePrinter must be used within a PrinterProvider');
    return context;
};
