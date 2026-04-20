import { useState } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Calendar, ChevronLeft, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

export const EVENT_SECTIONS = [
  { label: "General", value: "general" },
  { label: "Entradas", value: "tickets" },
  { label: "Ventas", value: "metrics" },
] as const

export type EventSectionValue = (typeof EVENT_SECTIONS)[number]["value"]

type EventStatus = "draft" | "active" | "finished"

type EventLayoutProps = {
  eventName: string
  /** Fecha, ubicación, etc. */
  eventSubtitle: string
  status: EventStatus
  activeSection: string
  onSectionChange: (value: string) => void
  children: React.ReactNode
}

function statusLabel(status: EventStatus) {
  switch (status) {
    case "active":
      return "Activo"
    case "draft":
      return "Borrador"
    case "finished":
      return "Finalizado"
  }
}

function statusBadgeClasses(status: EventStatus) {
  switch (status) {
    case "active":
      return "bg-green-500/15 text-green-700 dark:text-green-400"
    case "draft":
      return "bg-zinc-500/15 text-[#8E8E93] dark:text-[#98989D]"
    case "finished":
      return "bg-zinc-500/10 text-[#8E8E93] dark:text-[#98989D]"
  }
}

function SidebarNav({
  activeSection,
  onSelect,
}: {
  activeSection: string
  onSelect: (value: string) => void
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-3 pb-6" aria-label="Secciones del evento">
      {EVENT_SECTIONS.map((item) => {
        const active = activeSection === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={cn(
              "rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition-colors duration-200 active:opacity-70",
              active
                ? "bg-zinc-100 text-foreground dark:bg-zinc-800 dark:text-white"
                : "text-[#8E8E93] hover:bg-zinc-100/70 dark:text-[#98989D] dark:hover:bg-zinc-800/50"
            )}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

function SidebarHeader({
  eventName,
  eventSubtitle,
  status,
}: {
  eventName: string
  eventSubtitle: string
  status: EventStatus
}) {
  return (
    <div className="border-b border-zinc-200/50 px-4 pb-5 pt-4 dark:border-zinc-800/50">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#8E8E93] transition-colors duration-200 hover:text-foreground active:opacity-60 dark:text-[#98989D]"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        Volver
      </Link>
      <div className="mt-5 space-y-2">
        <h1 className="text-[22px] font-bold leading-[1.15] tracking-tight text-foreground lg:text-[26px]">
          {eventName}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              statusBadgeClasses(status)
            )}
          >
            {statusLabel(status)}
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-500/10">
            <Calendar className="h-3.5 w-3.5 text-[#8E8E93] dark:text-[#98989D]" />
          </span>
          <p className="text-sm leading-snug text-[#8E8E93] dark:text-[#98989D]">{eventSubtitle}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Shell estilo split view: sidebar contextual del evento + canvas principal.
 * Oculta el layout global de la app — usar solo dentro de la ruta de detalle de evento.
 */
export function EventLayout({
  eventName,
  eventSubtitle,
  status,
  activeSection,
  onSectionChange,
  children,
}: EventLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  function selectSection(value: string) {
    onSectionChange(value)
    setMobileNavOpen(false)
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F2F2F7] text-black dark:bg-black dark:text-white lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200/50",
          "bg-white/75 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/75 lg:flex"
        )}
      >
        <SidebarHeader
          eventName={eventName}
          eventSubtitle={eventSubtitle}
          status={status}
        />
        <p className="px-4 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
          Secciones
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav activeSection={activeSection} onSelect={selectSection} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-screen">
        {/* Mobile: barra superior + sheet de navegación */}
        <div className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-zinc-200/50 bg-white/80 px-3 py-2.5 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/80 lg:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg"
                aria-label="Abrir menú del evento"
              >
                <Menu className="h-5 w-5 text-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(100vw,18rem)] flex-col gap-0 border-zinc-200/50 p-0 shadow-none ring-zinc-200/50 dark:border-zinc-800/50 dark:ring-zinc-800/50"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Evento</SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <SidebarHeader
                  eventName={eventName}
                  eventSubtitle={eventSubtitle}
                  status={status}
                />
                <p className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[#8E8E93]">
                  Secciones
                </p>
                <SidebarNav activeSection={activeSection} onSelect={selectSection} />
              </div>
            </SheetContent>
          </Sheet>
          <Link
            to="/events"
            className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-[#8E8E93] active:opacity-60 dark:text-[#98989D]"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Link>
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-foreground">
            {eventName}
          </p>
        </div>

        {children}
      </div>
    </div>
  )
}

export function sectionTitle(activeSection: string): string {
  const found = EVENT_SECTIONS.find((s) => s.value === activeSection)
  return found?.label ?? "Evento"
}
