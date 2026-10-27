import { useCallback, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { EventMobileNavContext } from "./event-mobile-nav"

type MobileBack = {
  label: string
  to?: string
  onClick?: () => void
}

type EventLayoutProps = {
  children: ReactNode
  /**
   * Paso actual en mobile: volver a eventos o volver al índice de secciones.
   * Si no se pasa, el encabezado se oculta en mobile (la vista abierta trae su propio botón).
   */
  mobileBack?: MobileBack | null
  /** Ignora los registros de vistas anidadas mientras se muestra el índice de secciones. */
  mobileNestedEnabled?: boolean
}

const mobileBackClass =
  "inline-flex h-10 items-center gap-1.5 rounded-lg pl-1 pr-3 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9500] lg:hidden"

export function EventLayout({
  children,
  mobileBack,
  mobileNestedEnabled = true,
}: EventLayoutProps) {
  const [nestedIds, setNestedIds] = useState<Set<symbol>>(() => new Set())

  const setId = useCallback((id: symbol, open: boolean) => {
    setNestedIds((current) => {
      const alreadyOpen = current.has(id)
      if (open === alreadyOpen) return current
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const registry = useMemo(
    () => ({ setId, nestedCount: nestedIds.size }),
    [setId, nestedIds.size]
  )
  const nestedActive = nestedIds.size > 0
  const showMobileBack =
    Boolean(mobileBack) && (!mobileNestedEnabled || !nestedActive)

  return (
    <EventMobileNavContext.Provider value={registry}>
      <div className="min-h-screen bg-black text-white">
        <header
          className={cn(
            "sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl",
            !showMobileBack && "hidden lg:block"
          )}
        >
          <div className="flex min-h-14 items-center gap-2 px-4 py-2 sm:px-8">
            <Link
              to="/eventos"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70 lg:flex"
              aria-label="Volver a eventos"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            {showMobileBack && mobileBack ? (
              mobileBack.to ? (
                <Link
                  to={mobileBack.to}
                  className={mobileBackClass}
                  aria-label={`Volver a ${mobileBack.label}`}
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span>{mobileBack.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={mobileBack.onClick}
                  className={mobileBackClass}
                  aria-label={`Volver a ${mobileBack.label}`}
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span>{mobileBack.label}</span>
                </button>
              )
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </EventMobileNavContext.Provider>
  )
}
