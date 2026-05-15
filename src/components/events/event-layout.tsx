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

function statusLabel(status: EventStatus): string {
  if (status === "active") return "Activo"
  if (status === "finished") return "Finalizado"
  return "Borrador"
}

function statusBadgeClasses(status: EventStatus): string {
  if (status === "active") return "bg-[#FF9500]/15 text-[#FF9500]"
  if (status === "finished") return "bg-white/[0.07] text-white/40"
  return "bg-white/[0.07] text-white/40"
}

export function EventLayout({
  eventName,
  eventSubtitle,
  status,
  activeSection,
  shopUrl,
  linkCopied,
  onCopyLink,
  children,
}: EventLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] text-black dark:bg-[#0a0a0a] dark:text-white">
      <header className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-xl">
        {/* Event identity row */}
        <div className="flex items-center gap-2 px-4 py-3 sm:px-8">
          <Link
            to="/events"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
            aria-label="Volver a eventos"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[17px] font-bold tracking-tight sm:text-[19px]">
                {eventName}
              </h1>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  statusBadgeClasses(status)
                )}
              >
                {statusLabel(status)}
              </span>
            </div>
            {eventSubtitle && (
              <p className="truncate text-[13px] text-zinc-500">{eventSubtitle}</p>
            )}
          </div>

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
