import { useState } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { admissionInputToIso, toAdmissionInput, type AdmissionWindow } from "@/lib/ticket-admission"

export function TicketAdmissionFields({ from, until, onFromChange, onUntilChange, eventDate, disabled }: {
  from: string; until: string; onFromChange: (value: string) => void
  onUntilChange: (value: string) => void; eventDate: string; disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-white/80">Horario de uso</legend>
      <p className="text-xs leading-relaxed text-white/50">
        Hora Argentina (UTC−3). Evento: {toAdmissionInput(eventDate).slice(0, 10).split("-").reverse().join("/")}.
        Dejá un campo vacío para no limitar ese extremo. Para la madrugada, elegí el día siguiente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 space-y-1 text-xs text-white/60">
          <span>Válida desde (opcional)</span>
          <input type="datetime-local" value={from} onChange={(e) => onFromChange(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-2 text-sm text-white [color-scheme:dark]" />
        </label>
        <label className="min-w-0 space-y-1 text-xs text-white/60">
          <span>Válida hasta (opcional)</span>
          <input type="datetime-local" value={until} onChange={(e) => onUntilChange(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-2 text-sm text-white [color-scheme:dark]" />
        </label>
      </div>
      <p className="text-xs text-white/50">Aplica al ingreso y al reingreso. A la hora de cierre ya no permite entrar.</p>
    </fieldset>
  )
}

export function TicketAdmissionEditor({ type, eventId, eventDate, onChanged }: {
  type: AdmissionWindow & { id: string }; eventId: string; eventDate: string; onChanged: () => void
}) {
  const token = useAuthStore((state) => state.token)
  const [from, setFrom] = useState(() => toAdmissionInput(type.validFrom))
  const [until, setUntil] = useState(() => toAdmissionInput(type.validUntil))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = from !== toAdmissionInput(type.validFrom) || until !== toAdmissionInput(type.validUntil)
  async function save() {
    if (!token || saving) return
    if (from && until && from >= until) {
      setError("El horario hasta debe ser posterior al horario desde.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${type.id}`, {
        method: "PATCH", token,
        body: JSON.stringify({ validFrom: admissionInputToIso(from), validUntil: admissionInputToIso(until) }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el horario")
    } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-3">
      <TicketAdmissionFields from={from} until={until} onFromChange={setFrom} onUntilChange={setUntil} eventDate={eventDate} disabled={saving} />
      <p className="text-xs text-white/45">Los cambios también se aplican a las entradas ya emitidas de este tipo.</p>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <button type="button" disabled={saving || !changed} onClick={() => void save()} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white disabled:opacity-40">
        {saving ? "Guardando…" : "Guardar horario"}
      </button>
    </div>
  )
}
