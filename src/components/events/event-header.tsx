import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, ChevronLeft, Settings } from "lucide-react"

const EVENT_TABS = [
  { label: "Resumen", value: "summary" },
  { label: "Entradas", value: "tickets" },
  { label: "Bar / Stock", value: "bar-stock" },
  { label: "Personal", value: "staff" },
  { label: "Control de acceso", value: "gate-control" },
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

export function EventHeader({
  eventName,
  eventDate,
  status,
  activeTab,
  onTabChange,
}: EventHeaderProps) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-4 p-4 lg:p-6">
        <Link
          to="/events"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Volver al panel</span>
        </Link>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{eventName}</h1>
            <Badge
              className={
                status === "active"
                  ? "border-0 bg-primary/20 text-primary hover:bg-primary/20"
                  : status === "draft"
                  ? "border-0 bg-secondary text-secondary-foreground"
                  : "border-muted-foreground/50 text-muted-foreground"
              }
              variant={status === "finished" ? "outline" : "default"}
            >
              {statusLabel(status)}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{eventDate}</span>
          </div>
        </div>

        <Button variant="outline" size="sm" className="hidden md:flex">
          <Settings className="mr-2 h-4 w-4" />
          Ajustes del evento
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="px-4 lg:px-6">
        <TabsList className="h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent p-0">
          {EVENT_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
