/**
 * Tarea 3.1 — Parser del código de barras del DNI argentino (visión §2.4: "Da el DNI y el
 * guardia escanea el código de barras del documento"). Soporta los dos formatos históricos:
 *
 * 1) **DNI nuevo** (tarjeta plástica, Code 128): campos separados por `@` en el orden
 *    `apellido@nombres@sexo@fecha_nacimiento@trámite@dni@cuil`, donde `fecha_nacimiento` es
 *    DDMMYYYY y `sexo` es M/F. Algunas emisiones agregan un campo extra al inicio, así que la
 *    posición de los campos se resuelve DESDE EL FINAL (cuil, dni, trámite, fecha, sexo) y lo
 *    que sobra a la izquierda es el nombre.
 *
 * 2) **Libreta verde** (documento viejo, Code 39): solo dígitos = número de DNI + dígito
 *    verificador (a veces el número solo). El verificador es el mod-11 del CUIL: se valida
 *    contra los prefijos 20/23/24/27 (cero-pad del DNI a 8 dígitos); si ningún prefijo cierra,
 *    se asume que el código es el número desnudo (tolerante: la puerta no debe trabarse por
 *    una emisión rara; el backend valida la existencia del ticket igual).
 *
 * Devuelve `{ dni, birthDate? }` — `birthDate` solo existe en el DNI nuevo, en ISO "YYYY-MM-DD"
 * (lo que necesita el chequeo de +18).
 */

export type ParsedDniBarcode = {
  /** Número de documento, sin ceros de relleno. */
  dni: string
  /** Fecha de nacimiento ISO "YYYY-MM-DD" — presente solo en el DNI nuevo (Code 128). */
  birthDate?: string
  lastName?: string
  firstName?: string
}

/** Validación del dígito verificador de CUIL/CUIT (mod-11, pesos 5..2 sobre prefijo + DNI). */
function cuilCheckDigit(dni: string, prefix: string): number | null {
  const base = `${prefix}${dni.padStart(8, "0")}`
  if (base.length !== 10) return null
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = base.split("").reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0)
  let check = 11 - (sum % 11)
  if (check === 11) check = 0
  if (check === 10) return null // prefijo inválido para esta persona
  return check
}

/** True si `dni` + `check` forman un CUIL válido con algún prefijo habitual. */
function cuilMatches(dni: string, check: string): boolean {
  for (const prefix of ["20", "23", "24", "27"]) {
    const computed = cuilCheckDigit(dni, prefix)
    if (computed !== null && computed === Number(check)) return true
  }
  return false
}

/** Convierte DDMMYYYY → ISO "YYYY-MM-DD"; null si no es una fecha válida. */
function ddmmYYYYToIso(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null
  const day = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const year = Number(value.slice(4, 8))
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  // Valida días reales del mes (31 de febrero no existe).
  const d = new Date(`${iso}T00:00:00Z`)
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return iso
}

/** Normaliza el DNI (quita ceros de relleno a la izquierda, conserva el número real). */
function normalizeDni(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits.replace(/^0+/, "") || digits
}

export function parseDniBarcode(raw: string): ParsedDniBarcode | null {
  const text = raw.trim()
  if (!text) return null

  // --- DNI nuevo (Code 128): campos separados por "@" -------------------------------
  if (text.includes("@")) {
    const fields = text
      .split("@")
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
    if (fields.length < 6) return null

    // Posición desde el final: [.., sexo, nacimiento, trámite, dni, cuil]
    const cuil = fields[fields.length - 1]
    const dniField = fields[fields.length - 2]
    const tramite = fields[fields.length - 3]
    const nacimiento = fields[fields.length - 4]
    const sexo = fields[fields.length - 5]
    const names = fields.slice(0, fields.length - 5)

    if (!/^\d{6,8}$/.test(dniField)) return null
    // El CUIL puede venir con guiones ("20-12345678-5") o pelado.
    if (!/^[\d-]{10,13}$/.test(cuil)) return null
    if (!/^\d{8,12}$/.test(tramite)) return null
    if (!/^[MF]$/.test(sexo)) return null

    const birthDate = ddmmYYYYToIso(nacimiento)
    if (!birthDate) return null

    return {
      dni: normalizeDni(dniField),
      birthDate,
      lastName: names[0] || undefined,
      firstName: names.slice(1).join(" ") || undefined,
    }
  }

  // --- Libreta verde (Code 39): dígitos = DNI [+ dígito verificador] ----------------
  if (/^\d{7,10}$/.test(text)) {
    // 9+ dígitos → DNI de 8 + verificador (estándar de la libreta verde).
    if (text.length >= 9) {
      const dni = text.slice(0, -1)
      if (/^\d{7,8}$/.test(dni)) {
        return { dni: normalizeDni(dni) }
      }
    }
    // 8 dígitos → DNI de 7 + verificador, o DNI de 8 pelado: el verificador decide.
    if (text.length === 8) {
      const as7PlusCheck = text.slice(0, 7)
      if (cuilMatches(as7PlusCheck, text.slice(-1))) {
        return { dni: normalizeDni(as7PlusCheck) }
      }
    }
    return { dni: normalizeDni(text) }
  }

  return null
}
