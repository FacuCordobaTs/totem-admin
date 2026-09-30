/**
 * Renglón «Promotor general: …» que acompaña a un promotor en los listados de la productora
 * (Resumen y Equipo). Los promotores de la productora no pertenecen a ninguno, así que sin
 * nombre no dibuja nada.
 *
 * Envuelve en vez de recortar: en el celular la columna del nombre queda angosta (los botones
 * de la fila le ganan el ancho) y un renglón cortado ocultaría justo el dato que se busca.
 */
export function GeneralPromoterLine({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <p className="break-words text-[12px] text-white/40">
      Promotor general: <span className="text-white/60">{name}</span>
    </p>
  )
}
