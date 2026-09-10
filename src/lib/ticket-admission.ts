export type AdmissionWindow = { validFrom?: string | null; validUntil?: string | null }

export function formatAdmissionWindow(window: AdmissionWindow): string | null {
  const format = (iso: string) => new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  })
  const parts = [window.validFrom ? `desde el ${format(window.validFrom)}` : "",
    window.validUntil ? `hasta el ${format(window.validUntil)}` : ""].filter(Boolean)
  return parts.length ? `Ingreso ${parts.join(" ")} (hora Argentina)` : null
}

/** Inputs civiles de Argentina, independientes del huso horario del navegador. */
export function toAdmissionInput(iso?: string | null): string {
  return iso ? new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16) : ""
}

export function admissionInputToIso(value: string): string | null {
  return value ? new Date(`${value}:00-03:00`).toISOString() : null
}
