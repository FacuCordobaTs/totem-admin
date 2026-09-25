/**
 * Slug de la URL pública del evento (`crow.ar/{slug}`). Lo comparten la configuración del
 * dashboard y la creación (autocompletado desde el nombre).
 */

/** Normaliza texto libre a slug: minúsculas, sin acentos, separado por guiones. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

/** Mismo formato que exige el backend: 2-100 caracteres, minúsculas, números y guiones. */
export function isValidSlug(s: string): boolean {
  return s.length >= 2 && s.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}
