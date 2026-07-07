/**
 * Utilidades ESC/POS para impresoras térmicas (58mm / 80mm) en el POS de Crow.
 *
 * El backend Tauri (`send_print_job`) recibe un array de bytes crudos (RAW) y lo
 * manda tal cual a la impresora. Acá construimos esos bytes con comandos ESC/POS.
 *
 * Ancho de línea asumido: 32 caracteres (fuente A, papel de 58mm). Si usás papel
 * de 80mm podés subir LINE_WIDTH a 48.
 */

// ---------------------------------------------------------------------------
// Comandos ESC/POS de control
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

/** Caracteres por línea (fuente A, 58mm). */
const LINE_WIDTH = 32;

const CMD = {
    INIT: [ESC, 0x40], // Inicializa / resetea la impresora
    ALIGN_LEFT: [ESC, 0x61, 0x00],
    ALIGN_CENTER: [ESC, 0x61, 0x01],
    ALIGN_RIGHT: [ESC, 0x61, 0x02],
    BOLD_ON: [ESC, 0x45, 0x01],
    BOLD_OFF: [ESC, 0x45, 0x00],
    // Tamaño de fuente (GS ! n): 0x00 = normal, 0x11 = doble ancho + doble alto
    SIZE_NORMAL: [GS, 0x21, 0x00],
    SIZE_DOUBLE: [GS, 0x21, 0x11],
    SIZE_DOUBLE_HEIGHT: [GS, 0x21, 0x01],
    FEED: [0x0a], // Salto de línea (LF)
    // Corte parcial de papel
    CUT: [GS, 0x56, 0x01],
} as const;

// ---------------------------------------------------------------------------
// Helpers de texto
// ---------------------------------------------------------------------------

/** Convierte un string a bytes usando la tabla de caracteres del código (Latin-1 aprox). */
function textToBytes(text: string): number[] {
    const bytes: number[] = [];
    for (const ch of text) {
        const code = ch.charCodeAt(0);
        // La impresora usa CP437/Latin. Mapear acentos comunes a su equivalente ASCII
        // para evitar caracteres corruptos si la impresora no tiene la codepage cargada.
        bytes.push(code <= 0xff ? code : sanitizeChar(ch));
    }
    return bytes;
}

function sanitizeChar(ch: string): number {
    const map: Record<string, string> = {
        á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
        Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U',
        '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '€': 'E',
    };
    const replacement = map[ch] ?? '?';
    return replacement.charCodeAt(0);
}

/** Línea de texto simple + salto de línea. */
function line(text = ''): number[] {
    return [...textToBytes(text), ...CMD.FEED];
}

/** Línea separadora (guiones) del ancho del ticket. */
function separator(char = '-'): number[] {
    return line(char.repeat(LINE_WIDTH));
}

/**
 * Fila con etiqueta a la izquierda y valor a la derecha, justificado al ancho.
 * Si no entra en una línea, el valor se recorta.
 */
function row(left: string, right: string): number[] {
    const space = LINE_WIDTH - left.length - right.length;
    if (space >= 1) {
        return line(left + ' '.repeat(space) + right);
    }
    // No entra: recortamos la etiqueta izquierda
    const maxLeft = Math.max(0, LINE_WIDTH - right.length - 1);
    return line(left.slice(0, maxLeft) + ' ' + right);
}

/** Formatea un monto como pesos argentinos sin símbolo unicode (evita corrupción). */
function money(amount: number | string): string {
    const n = typeof amount === 'string' ? parseFloat(amount) : amount;
    const safe = Number.isFinite(n) ? n : 0;
    return '$' + safe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: Date | string | null | undefined): string {
    if (!value) return new Date().toLocaleString('es-AR');
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    MERCADOPAGO: 'Mercado Pago',
    TRANSFER: 'Transferencia',
};

// ---------------------------------------------------------------------------
// Tipos de dominio (Crow)
// ---------------------------------------------------------------------------

export interface TicketPrintData {
    /** Nombre del tipo de entrada (General, VIP, etc.). */
    ticketTypeName: string;
    buyerName?: string | null;
    qrHash: string;
    status?: 'PENDING' | 'USED' | 'CANCELLED' | null;
    scannedAt?: Date | string | null;
}

export interface EventPrintData {
    name: string;
    location?: string | null;
    date?: Date | string | null;
}

export interface ProductoraPrintData {
    name: string;
}

export interface SaleItemPrintData {
    name: string;
    quantity: number;
    /** Precio unitario. */
    priceAtTime: number | string;
}

export interface SalePrintData {
    id: string;
    receiptToken?: string | null;
    totalAmount: number | string;
    paymentMethod: 'CASH' | 'CARD' | 'MERCADOPAGO' | 'TRANSFER';
    staffName?: string | null;
    customerName?: string | null;
    createdAt?: Date | string | null;
}

export interface CajaSalePrintData {
    totalAmount: number | string;
    paymentMethod: 'CASH' | 'CARD' | 'MERCADOPAGO' | 'TRANSFER';
}

// ---------------------------------------------------------------------------
// Formatters de dominio
// ---------------------------------------------------------------------------

/**
 * Ticket de entrada para imprimir al validar un ingreso en puerta.
 * Pensado para dejar constancia física del acceso.
 */
export function formatTicketEntrada(
    ticket: TicketPrintData,
    evento: EventPrintData,
    productora: ProductoraPrintData
): number[] {
    const cmds: number[] = [];
    cmds.push(...CMD.INIT);

    // Encabezado: productora
    cmds.push(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON);
    cmds.push(...line(productora.name.toUpperCase()));
    cmds.push(...CMD.BOLD_OFF);

    // Título grande: nombre del evento
    cmds.push(...CMD.SIZE_DOUBLE);
    cmds.push(...line(evento.name));
    cmds.push(...CMD.SIZE_NORMAL);

    if (evento.location) cmds.push(...line(evento.location));
    if (evento.date) cmds.push(...line(formatDate(evento.date)));

    cmds.push(...CMD.FEED);
    cmds.push(...separator());

    // Tipo de entrada (destacado)
    cmds.push(...CMD.SIZE_DOUBLE_HEIGHT, ...CMD.BOLD_ON);
    cmds.push(...line(ticket.ticketTypeName.toUpperCase()));
    cmds.push(...CMD.BOLD_OFF, ...CMD.SIZE_NORMAL);

    cmds.push(...CMD.ALIGN_LEFT);
    if (ticket.buyerName) cmds.push(...row('Titular:', ticket.buyerName));
    const estado = ticket.status === 'USED' ? 'INGRESADO' : ticket.status === 'CANCELLED' ? 'ANULADO' : 'VALIDO';
    cmds.push(...row('Estado:', estado));
    if (ticket.scannedAt) cmds.push(...row('Ingreso:', formatDate(ticket.scannedAt)));

    cmds.push(...separator());

    // Código QR (texto legible del hash como respaldo)
    cmds.push(...CMD.ALIGN_CENTER);
    cmds.push(...line('Codigo:'));
    cmds.push(...line(ticket.qrHash));

    cmds.push(...CMD.FEED, ...CMD.FEED);
    cmds.push(...CMD.CUT);
    return cmds;
}

/**
 * Recibo de una venta realizada en el POS de barra.
 */
export function formatReciboVentaBarra(
    sale: SalePrintData,
    saleItems: SaleItemPrintData[],
    barNombre: string,
    eventoNombre: string
): number[] {
    const cmds: number[] = [];
    cmds.push(...CMD.INIT);

    // Encabezado
    cmds.push(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON);
    cmds.push(...CMD.SIZE_DOUBLE_HEIGHT);
    cmds.push(...line('CROW'));
    cmds.push(...CMD.SIZE_NORMAL);
    cmds.push(...CMD.BOLD_OFF);
    cmds.push(...line(eventoNombre));
    cmds.push(...line('Barra: ' + barNombre));
    cmds.push(...CMD.FEED);

    cmds.push(...CMD.ALIGN_LEFT);
    cmds.push(...row('Fecha:', formatDate(sale.createdAt)));
    if (sale.staffName) cmds.push(...row('Cajero:', sale.staffName));
    if (sale.customerName) cmds.push(...row('Cliente:', sale.customerName));

    cmds.push(...separator());

    // Detalle de items
    let calcTotal = 0;
    for (const item of saleItems) {
        const unit = typeof item.priceAtTime === 'string' ? parseFloat(item.priceAtTime) : item.priceAtTime;
        const lineTotal = (Number.isFinite(unit) ? unit : 0) * item.quantity;
        calcTotal += lineTotal;
        // Línea 1: nombre del producto
        cmds.push(...line(item.name));
        // Línea 2: cantidad x precio ...... total
        cmds.push(...row(`  ${item.quantity} x ${money(unit)}`, money(lineTotal)));
    }

    cmds.push(...separator());

    // Total
    const total = sale.totalAmount != null && sale.totalAmount !== '' ? sale.totalAmount : calcTotal;
    cmds.push(...CMD.SIZE_DOUBLE_HEIGHT, ...CMD.BOLD_ON);
    cmds.push(...row('TOTAL', money(total)));
    cmds.push(...CMD.BOLD_OFF, ...CMD.SIZE_NORMAL);

    cmds.push(...row('Pago:', PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod));

    cmds.push(...CMD.FEED);
    cmds.push(...CMD.ALIGN_CENTER);
    if (sale.receiptToken) cmds.push(...line('Comprobante: ' + sale.receiptToken));
    cmds.push(...line('Gracias por tu compra!'));

    cmds.push(...CMD.FEED, ...CMD.FEED);
    cmds.push(...CMD.CUT);
    return cmds;
}

/**
 * Resumen / cierre de caja de una barra: totales por método de pago y total general.
 */
export function formatResumenCaja(
    ventas: CajaSalePrintData[],
    barNombre: string,
    eventoNombre: string
): number[] {
    const cmds: number[] = [];
    cmds.push(...CMD.INIT);

    cmds.push(...CMD.ALIGN_CENTER, ...CMD.BOLD_ON);
    cmds.push(...CMD.SIZE_DOUBLE_HEIGHT);
    cmds.push(...line('CIERRE DE CAJA'));
    cmds.push(...CMD.SIZE_NORMAL, ...CMD.BOLD_OFF);
    cmds.push(...line(eventoNombre));
    cmds.push(...line('Barra: ' + barNombre));
    cmds.push(...line(formatDate(new Date())));
    cmds.push(...CMD.FEED);

    cmds.push(...CMD.ALIGN_LEFT);
    cmds.push(...separator());

    // Agregar por método de pago
    const totals: Record<string, { count: number; amount: number }> = {};
    let grandTotal = 0;
    for (const v of ventas) {
        const amount = typeof v.totalAmount === 'string' ? parseFloat(v.totalAmount) : v.totalAmount;
        const safe = Number.isFinite(amount) ? amount : 0;
        const key = v.paymentMethod;
        if (!totals[key]) totals[key] = { count: 0, amount: 0 };
        totals[key].count += 1;
        totals[key].amount += safe;
        grandTotal += safe;
    }

    cmds.push(...row('Ventas totales:', String(ventas.length)));
    cmds.push(...separator());

    for (const method of ['CASH', 'CARD', 'MERCADOPAGO', 'TRANSFER'] as const) {
        const t = totals[method];
        if (!t) continue;
        cmds.push(...line(`${PAYMENT_LABELS[method]} (${t.count})`));
        cmds.push(...row('', money(t.amount)));
    }

    cmds.push(...separator());
    cmds.push(...CMD.SIZE_DOUBLE_HEIGHT, ...CMD.BOLD_ON);
    cmds.push(...row('TOTAL', money(grandTotal)));
    cmds.push(...CMD.BOLD_OFF, ...CMD.SIZE_NORMAL);

    cmds.push(...CMD.FEED, ...CMD.FEED);
    cmds.push(...CMD.CUT);
    return cmds;
}

/**
 * Convierte un array de comandos (bytes) al formato aceptado por `printRaw` / Tauri.
 * Es idéntico a piru: acá simplemente se garantiza que sea un array plano de números 0-255.
 */
export function commandsToBytes(commands: number[]): number[] {
    return commands.map((b) => b & 0xff);
}
