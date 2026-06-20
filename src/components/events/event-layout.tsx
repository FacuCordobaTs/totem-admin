import { Link } from "react-router"
import { ChevronLeft } from "lucide-react"

export const NAV_SECTIONS = [
  { label: "Resumen", id: "resumen" },
  { label: "Entradas", id: "entradas" },
  { label: "Bar", id: "bar" },
  { label: "Personal", id: "personal" },
  { label: "Finanzas", id: "finanzas" },
] as const

export type EventSectionId = (typeof NAV_SECTIONS)[number]["id"]

type EventLayoutProps = {
  children: React.ReactNode
}

export function EventLayout({ children }: EventLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl">
        <div className="flex items-center gap-2 px-4 py-3 sm:px-8">
          <Link
            to="/eventos"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
            aria-label="Volver a eventos"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
