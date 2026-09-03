import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router"
import { publicApiFetch, ApiError } from "@/lib/api"
import { EventClosedReport } from "@/components/events/event-closed-report"
import type { EventClosingReport } from "@/types/events"
import { Loader2 } from "lucide-react"

/**
 * Página pública del reporte de cierre (tarea 4.5 / spec §5 "Cerrado": compartible por link).
 * Solo lectura, sin auth. Consume `GET /public/events/:id/report`, que responde únicamente para
 * eventos ya cerrados con su liquidación congelada. Reusa `EventClosedReport`.
 */

type ReportPayload = {
  productora: { name: string }
  event: {
    id: string
    name: string
    date: string
    venue: string | null
    location: string | null
  }
  report: EventClosingReport
}

export function ReportPage() {
  const { id } = useParams<{ id: string }>()

  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    setLoading(true)
    try {
      const data = await publicApiFetch<ReportPayload>(
        `/public/events/${id}/report`,
        { method: "GET" }
      )
      setPayload(data)
    } catch (err) {
      setPayload(null)
      setLoadError(
        err instanceof ApiError ? err.message : "No se pudo cargar el reporte"
      )
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF9500]" aria-hidden />
      </div>
    )
  }

  if (loadError || !payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <p className="text-[17px] font-semibold text-white/70">
          {loadError ?? "Reporte no disponible"}
        </p>
        <p className="text-[14px] text-white/40">
          El reporte solo está disponible para eventos ya cerrados.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <EventClosedReport
          report={payload.report}
          eventName={payload.event.name}
          eventDate={payload.event.date}
          location={payload.event.venue ?? payload.event.location}
          productora={payload.productora.name}
        />
      </div>
    </div>
  )
}
