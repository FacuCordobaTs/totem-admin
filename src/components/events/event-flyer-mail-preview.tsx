import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { EventImageUploader } from "@/components/events/event-image-uploader"
import { cn } from "@/lib/utils"
import { QrCode } from "lucide-react"
import type { ApiEvent } from "@/types/events"

type Props = {
  event: ApiEvent
  onUpdated: () => void
}

type TicketTypesResponse = {
  ticketTypes: { id: string; name: string }[]
}

/**
 * Columna izquierda de la sección Página: por defecto muestra el flyer (uploader), con un
 * toggle que permite ver en su lugar el **mail** con la entrada tal como le llega al cliente.
 * El mail es un rectángulo plano (no un marco de teléfono), con las mismas dimensiones que el
 * flyer para no romper el layout actual.
 */
export function EventFlyerMailPreview({ event, onUpdated }: Props) {
  const token = useAuthStore((s) => s.token)
  const [view, setView] = useState<"flyer" | "mail">("flyer")
  const [ticketName, setTicketName] = useState<string | null>(null)

  const loadTypes = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiFetch<TicketTypesResponse>(
        `/events/${event.id}/ticket-types`,
        { method: "GET", token }
      )
      setTicketName(data.ticketTypes[0]?.name ?? null)
    } catch {
      /* preview tolera falta de tipos */
    }
  }, [token, event.id])

  useEffect(() => {
    void loadTypes()
  }, [loadTypes])

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-white/[0.10] bg-white/[0.04] p-1">
        {(
          [
            { id: "flyer" as const, label: "Flyer" },
            { id: "mail" as const, label: "Mail" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            aria-pressed={view === t.id}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              view === t.id
                ? "bg-[#FF9500] text-white"
                : "text-white/50 hover:text-white/80"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "flyer" ? (
        <EventImageUploader event={event} onUpdated={onUpdated} compact />
      ) : (
        <MailPreview event={event} ticketName={ticketName} />
      )}
    </div>
  )
}

/**
 * Preview del mail con la entrada. Espeja el template real `backend/src/emails/TicketEmail.tsx`
 * (fondo negro, marca "Crow" en serif espaciada, evento en serif, botón "Abrir CROW", el QR y
 * "Te esperamos"). Se muestra en un rectángulo plano, con la proporción del flyer (9/16).
 */
function MailPreview({
  event,
  ticketName,
}: {
  event: ApiEvent
  ticketName: string | null
}) {
  const paper = "#F4EFE6"
  const serif = `'Tiempos Headline', Georgia, 'Times New Roman', serif`
  const name = ticketName ?? "Entrada general"

  return (
    <div className="w-full" style={{ aspectRatio: "9/16" }}>
      <div
        className="h-full w-full overflow-y-auto rounded-xl bg-black px-4 py-8"
        style={{ color: paper, scrollbarWidth: "none" }}
      >
        <div
          className="mx-auto max-w-[300px] px-6 py-9"
          style={{ border: "1px solid rgba(244,239,230,0.18)" }}
        >
          {/* Marca */}
          <p
            className="text-center"
            style={{
              fontFamily: serif,
              fontSize: "18px",
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              marginBottom: "32px",
            }}
          >
            Crow
          </p>

          {/* Evento */}
          <h1
            className="text-center"
            style={{
              fontFamily: serif,
              fontSize: "24px",
              lineHeight: 1.2,
              margin: "0 0 28px",
            }}
          >
            {event.name}
          </h1>

          <p style={{ fontFamily: serif, fontSize: "14px", margin: "0 0 12px" }}>
            Asistente,
          </p>
          <p
            style={{
              fontFamily: serif,
              fontSize: "14px",
              lineHeight: 1.6,
              margin: "0 0 28px",
            }}
          >
            Tu lugar está confirmado. Los códigos viven en la app y también abajo.
          </p>

          {/* CTA */}
          <div className="text-center" style={{ marginBottom: "36px" }}>
            <span
              className="inline-block"
              style={{
                border: `1px solid ${paper}`,
                padding: "12px 28px",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
              }}
            >
              Abrir CROW
            </span>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(244,239,230,0.18)",
              marginBottom: "32px",
            }}
          />

          {/* QR */}
          <div className="text-center">
            <p
              style={{
                fontSize: "10px",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "rgba(244,239,230,0.55)",
                margin: "0 0 8px",
              }}
            >
              Entrada
            </p>
            <p
              style={{
                fontFamily: serif,
                fontSize: "16px",
                margin: "0 0 18px",
              }}
            >
              {name}
            </p>
            <div
              className="mx-auto flex items-center justify-center"
              style={{
                width: "140px",
                height: "140px",
                background: paper,
              }}
            >
              <QrCode className="h-24 w-24 text-black" strokeWidth={1} />
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(244,239,230,0.18)",
              margin: "36px 0 20px",
            }}
          />
          <p
            className="text-center"
            style={{
              fontSize: "10px",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(244,239,230,0.55)",
            }}
          >
            Te esperamos
          </p>
        </div>
      </div>
    </div>
  )
}
