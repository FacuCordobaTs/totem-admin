import { cn } from "@/lib/utils"

/**
 * Marca de Crow para las pantallas de acceso: el cuervo chico arriba y el
 * wordmark en serif debajo (spec §1). Es el único lugar del producto donde el
 * branding vive dentro de la interfaz. La familia serif reusa el mismo stack
 * que el mail del invitado (`event-flyer-mail-preview.tsx`) para no cargar una
 * fuente extra.
 */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <img src="/logo.png" alt="" className="h-10 w-auto rounded-2xl" />
      <span
        className="text-2xl leading-none tracking-tight text-foreground"
        style={{ fontFamily: "'Tiempos Headline', Georgia, 'Times New Roman', serif" }}
      >
        Crow
      </span>
    </div>
  )
}
