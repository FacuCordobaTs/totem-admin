import { Link } from "react-router"
import { Calendar, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

const EVENT_TABS = [
  { label: "General", value: "general" },
  { label: "Entradas", value: "tickets" },
  { label: "Métricas", value: "metrics" },
] as const

interface EventHeaderProps {
  eventName: string
  eventDate: string
  status: "draft" | "active" | "finished"
  activeTab: string
  onTabChange: (tab: string) => void
}

function statusLabel(status: EventHeaderProps["status"]) {
  switch (status) {
    case "active":
      return "Activo"
    case "draft":
      return "Borrador"
    case "finished":
      return "Finalizado"
  }
}

function statusBadgeClasses(status: EventHeaderProps["status"]) {
  switch (status) {
    case "active":
      return "bg-green-500/15 text-green-700 dark:text-green-400"
    case "draft":
      return "bg-zinc-500/15 text-[#8E8E93] dark:text-[#98989D]"
    case "finished":
      return "bg-zinc-500/10 text-[#8E8E93] dark:text-[#98989D]"
  }
}

export function EventHeader({
  eventName,
  eventDate,
  status,
  activeTab,
  onTabChange,
}: EventHeaderProps) {
  return (
    <header className="border-b border-zinc-200/50 bg-[#F2F2F7]/70 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70">
      <div className="flex flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <div className="flex min-w-0 flex-1 gap-4">
          <Link
            to="/events"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/50 bg-white text-[#8E8E93] transition-all duration-200 active:opacity-50 dark:border-zinc-800/50 dark:bg-[#1C1C1E] dark:text-[#98989D]"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">Volver al panel</span>
          </Link>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D]">
              Evento
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-black dark:text-white md:text-[34px]">
                {eventName}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  statusBadgeClasses(status)
                )}
              >
                {statusLabel(status)}
              </span>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-500/10">
                <Calendar className="h-4 w-4 text-[#8E8E93] dark:text-[#98989D]" />
              </span>
              <span className="text-[15px] leading-snug text-[#8E8E93] dark:text-[#98989D]">
                {eventDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-6">
        <p className="text-[13px] uppercase tracking-wide text-[#8E8E93] dark:text-[#98989D] ml-1 mb-2">
          Secciones
        </p>
        <div className="flex overflow-x-auto rounded-xl border border-zinc-200/50 bg-zinc-200/40 p-1 dark:border-zinc-800/50 dark:bg-zinc-800/50">
          {EVENT_TABS.map((tab) => {
            const isActive = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange(tab.value)}
                className={cn(
                  "min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-200 active:opacity-70",
                  isActive
                    ? "bg-white text-black dark:bg-[#3A3A3C] dark:text-white"
                    : "text-[#8E8E93] dark:text-[#98989D]"
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
