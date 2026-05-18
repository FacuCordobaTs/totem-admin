import { Link } from "react-router"
import { Check, ChevronLeft, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

export const NAV_SECTIONS = [
  { label: "Resumen", id: "resumen" },
  { label: "Entradas", id: "entradas" },
  { label: "Bar", id: "bar" },
  { label: "Personal", id: "personal" },
  { label: "Finanzas", id: "finanzas" },
] as const

export type EventSectionId = (typeof NAV_SECTIONS)[number]["id"]

type EventStatus = "draft" | "active" | "finished"

type EventLayoutProps = {
  eventName: string
  eventSubtitle: string
  status: EventStatus
  activeSection: string
  shopUrl?: string
  linkCopied?: boolean
  onCopyLink?: () => void
  children: React.ReactNode
}

export function EventLayout({
  activeSection,
  shopUrl,
  linkCopied,
  onCopyLink,
  children,
}: EventLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white ">
      <header className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl">
        {/* Event identity row */}
        <div className="flex items-center gap-2 px-4 py-3 sm:px-8">
          <Link
            to="/eventos"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
            aria-label="Volver a eventos"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>


          {shopUrl && onCopyLink && (
            <button
              type="button"
              onClick={onCopyLink}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.15] bg-transparent px-3 py-1.5 text-[13px] font-medium text-white/50 transition-all hover:border-white/25 hover:text-white/70 active:opacity-70"
            >
              {linkCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {linkCopied ? "Copiado" : "Copiar link"}
              </span>
            </button>
          )}
        </div>

        {/* Horizontal nav */}
        <nav
          className="flex items-end gap-0 overflow-x-auto px-4 sm:px-8"
          aria-label="Secciones del evento"
        >
          {NAV_SECTIONS.map((section) => {
            const active = activeSection === section.id
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={cn(
                  "relative shrink-0 border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors",
                  active
                    ? "border-[#FF9500] text-white"
                    : "border-transparent text-white/35 hover:text-white/60"
                )}
              >
                {section.label}
              </a>
            )
          })}
        </nav>
      </header>

      {children}
    </div>
  )
}
