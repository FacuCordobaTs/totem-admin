const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors [color-scheme:dark] focus:border-[#FF9500] disabled:opacity-50"

export function TicketAdmissionFields({
  from,
  until,
  onFromChange,
  onUntilChange,
  disabled
}: {
  from: string
  until: string
  onFromChange: (value: string) => void
  onUntilChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="sr-only">Horario de ingreso, hora Argentina</legend>
      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-[13px] font-medium text-white/70">Desde · hora Argentina</span>
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-[13px] font-medium text-white/70">Hasta · hora Argentina</span>
        <input
          type="datetime-local"
          value={until}
          onChange={(e) => onUntilChange(e.target.value)}
          className={inputClass}
        />
      </label>
    </fieldset>
  )
}
