import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Ban, ImagePlus, Loader2, Pencil, Plus, Search, Trash2, User, X } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

type BlacklistEntry = {
  id: string
  eventId: string
  dni: string
  fullName: string | null
  photoUrl: string | null
  reason: string
  isActive: boolean
  createdBy: string | null
  createdAt: string | null
}

type BlacklistResponse = { entries: BlacklistEntry[] }
type EntryResponse = { entry: BlacklistEntry }

const fieldClass = "border-white/[0.1] bg-white/[0.04] text-white placeholder:text-white/30"

export function AdmissionBlacklistPanel({ eventId, refreshTrigger, onChanged }: { eventId: string; refreshTrigger: number; onChanged?: () => void }) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"
  const [entries, setEntries] = useState<BlacklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<BlacklistEntry | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch<BlacklistResponse>(`/events/${eventId}/blacklist`, { method: "GET", token })
      setEntries(res.entries)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el registro de admisión")
    } finally {
      setLoading(false)
    }
  }, [eventId, token])

  useEffect(() => { void load() }, [load, refreshTrigger])

  const filteredEntries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return entries
    return entries.filter((entry) => [entry.fullName, entry.dni, entry.reason].some((value) => value?.toLocaleLowerCase().includes(term)))
  }, [entries, query])

  if (!canManage) return null
  const activeCount = entries.filter((entry) => entry.isActive).length

  return (
    <section className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-white/40" />
          <div>
            <h3 className="text-[17px] font-medium text-foreground">Registro de admisión</h3>
            <p className="text-[13px] text-white/40">{activeCount > 0 ? `${activeCount} persona${activeCount === 1 ? "" : "s"} activa${activeCount === 1 ? "" : "s"}` : "Personas con acceso restringido"}</p>
          </div>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2 rounded-lg bg-[#FF9500] text-white hover:bg-[#FF9500]/90">
          <Plus className="h-4 w-4" />
          Agregar persona
        </Button>
      </div>

      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, DNI o motivo…" className={cn("h-10 pl-9", fieldClass)} />
      </div>

      {error ? <p className="py-2 text-[14px] text-red-400" role="alert">{error}</p> : null}
      {loading ? <p className="py-5 text-[14px] text-white/40">Cargando…</p> : entries.length === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center text-[14px] text-white/40">No hay personas en el registro de admisión.</p>
      ) : filteredEntries.length === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-[14px] text-white/40">No encontramos personas para esa búsqueda.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          {filteredEntries.map((entry, index) => <EntryListItem key={entry.id} entry={entry} separated={index > 0} onClick={() => setSelected(entry)} />)}
        </div>
      )}

      <CreateEntryDialog open={createOpen} onOpenChange={setCreateOpen} eventId={eventId} onCreated={() => { setCreateOpen(false); void load(); onChanged?.() }} />
      <EntryDialog entry={selected} onOpenChange={(open) => !open && setSelected(null)} eventId={eventId} onChanged={() => { setSelected(null); void load(); onChanged?.() }} />
    </section>
  )
}

function EntryListItem({ entry, separated, onClick }: { entry: BlacklistEntry; separated: boolean; onClick: () => void }) {
  const name = entry.fullName?.trim() || "Sin nombre"
  return <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9500]", separated && "border-t border-white/[0.06]", !entry.isActive && "opacity-50")}>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06]">
      {entry.photoUrl ? <img src={entry.photoUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <User className="h-5 w-5 text-white/30" aria-hidden />}
    </div>
    <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-medium text-white">{name}</p><p className="truncate text-[12px] text-white/40">DNI {entry.dni} · {entry.reason}</p></div>
    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", entry.isActive ? "border-red-400/25 bg-red-400/[0.08] text-red-300" : "border-white/[0.1] bg-white/[0.04] text-white/40")}>{entry.isActive ? "Activa" : "Desactivada"}</span>
  </button>
}

function CreateEntryDialog({ open, onOpenChange, eventId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; eventId: string; onCreated: () => void }) {
  const token = useAuthStore((s) => s.token)
  const [dni, setDni] = useState("")
  const [fullName, setFullName] = useState("")
  const [reason, setReason] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  function close(next: boolean) { if (!next) { setDni(""); setFullName(""); setReason(""); setPhotoFile(null); setFormError(null) }; onOpenChange(next) }
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!token || saving) return
    if (!dni.trim() || !reason.trim()) return setFormError("Completá el DNI y el motivo.")
    setSaving(true); setFormError(null)
    try {
      const res = await apiFetch<EntryResponse>(`/events/${eventId}/blacklist`, { method: "POST", token, body: JSON.stringify({ dni: dni.trim(), fullName: fullName.trim() || null, reason: reason.trim() }) })
      if (photoFile) { const data = new FormData(); data.set("image", photoFile); await apiFetch(`/events/${eventId}/blacklist/${res.entry.id}/image`, { method: "POST", token, body: data }) }
      onCreated()
    } catch (err) { setFormError(err instanceof ApiError ? err.message : "No se pudo agregar la persona") } finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-md rounded-2xl border-white/[0.1] bg-black text-white"><DialogHeader><DialogTitle>Agregar persona</DialogTitle><DialogDescription className="text-white/45">La puerta rechazará las entradas asociadas a este DNI.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4"><EntryFields dni={dni} fullName={fullName} reason={reason} onDniChange={setDni} onNameChange={setFullName} onReasonChange={setReason} /><PhotoPicker file={photoFile} onChange={setPhotoFile} />{formError ? <p className="text-sm text-red-400">{formError}</p> : null}<DialogFooter><Button type="button" variant="ghost" onClick={() => close(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#FF9500] text-white hover:bg-[#FF9500]/90">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Agregando…" : "Agregar persona"}</Button></DialogFooter></form></DialogContent></Dialog>
}

function EntryDialog({ entry, onOpenChange, eventId, onChanged }: { entry: BlacklistEntry | null; onOpenChange: (open: boolean) => void; eventId: string; onChanged: () => void }) {
  const token = useAuthStore((s) => s.token)
  const photoInput = useRef<HTMLInputElement>(null)
  const [dni, setDni] = useState(""); const [fullName, setFullName] = useState(""); const [reason, setReason] = useState(""); const [active, setActive] = useState(true); const [photoUrl, setPhotoUrl] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [deleting, setDeleting] = useState(false); const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (entry) { setDni(entry.dni); setFullName(entry.fullName ?? ""); setReason(entry.reason); setActive(entry.isActive); setPhotoUrl(entry.photoUrl); setError(null) } }, [entry])
  async function save(event: React.FormEvent) { event.preventDefault(); if (!token || !entry || saving) return; if (!dni.trim() || !reason.trim()) return setError("Completá el DNI y el motivo."); setSaving(true); setError(null); try { await apiFetch(`/events/${eventId}/blacklist/${entry.id}`, { method: "PATCH", token, body: JSON.stringify({ dni: dni.trim(), fullName: fullName.trim() || null, reason: reason.trim(), isActive: active }) }); onChanged() } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo guardar") } finally { setSaving(false) } }
  async function upload(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!token || !entry || !file) return; setSaving(true); setError(null); try { const data = new FormData(); data.set("image", file); const res = await apiFetch<EntryResponse>(`/events/${eventId}/blacklist/${entry.id}/image`, { method: "POST", token, body: data }); setPhotoUrl(res.entry.photoUrl) } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo subir la foto") } finally { setSaving(false) } }
  async function removePhoto() { if (!token || !entry) return; setSaving(true); try { await apiFetch(`/events/${eventId}/blacklist/${entry.id}`, { method: "PATCH", token, body: JSON.stringify({ photoUrl: null }) }); setPhotoUrl(null) } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo quitar la foto") } finally { setSaving(false) } }
  async function remove() { if (!token || !entry) return; setDeleting(true); setError(null); try { await apiFetch(`/events/${eventId}/blacklist/${entry.id}`, { method: "DELETE", token }); onChanged() } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo eliminar") } finally { setDeleting(false) } }
  return <Dialog open={entry !== null} onOpenChange={onOpenChange}><DialogContent className="max-w-md rounded-2xl border-white/[0.1] bg-black text-white"><DialogHeader><DialogTitle>Persona del registro</DialogTitle><DialogDescription className="text-white/45">Editá sus datos, estado y foto desde acá.</DialogDescription></DialogHeader>{entry ? <form onSubmit={save} className="space-y-4"><div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">{photoUrl ? <img src={photoUrl} alt={fullName || "Persona"} className="h-full w-full object-cover" /> : <User className="h-6 w-6 text-white/30" />}</div><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={upload} /><Button type="button" variant="outline" disabled={saving} onClick={() => photoInput.current?.click()} className="border-white/[0.12] bg-transparent text-white hover:bg-white/[0.08]"><ImagePlus className="mr-2 h-4 w-4" />{photoUrl ? "Cambiar foto" : "Agregar foto"}</Button>{photoUrl ? <Button type="button" variant="ghost" disabled={saving} onClick={() => void removePhoto()} className="text-white/50 hover:text-red-400"><X className="h-4 w-4" /></Button> : null}</div><EntryFields dni={dni} fullName={fullName} reason={reason} onDniChange={setDni} onNameChange={setFullName} onReasonChange={setReason} /><div className="flex items-center justify-between rounded-xl border border-white/[0.08] px-3 py-2.5"><div><p className="text-sm font-medium">Restricción activa</p><p className="text-xs text-white/40">{active ? "Se bloqueará el acceso." : "No bloqueará el acceso."}</p></div><Switch checked={active} onCheckedChange={setActive} disabled={saving} /></div>{error ? <p className="text-sm text-red-400">{error}</p> : null}<DialogFooter className="gap-2 sm:justify-between"><Button type="button" variant="ghost" disabled={deleting} onClick={() => void remove()} className="text-red-400 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="mr-2 h-4 w-4" />{deleting ? "Eliminando…" : "Eliminar"}</Button><div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saving || deleting} className="bg-[#FF9500] text-white hover:bg-[#FF9500]/90"><Pencil className="mr-2 h-4 w-4" />{saving ? "Guardando…" : "Guardar cambios"}</Button></div></DialogFooter></form> : null}</DialogContent></Dialog>
}

function EntryFields({ dni, fullName, reason, onDniChange, onNameChange, onReasonChange }: { dni: string; fullName: string; reason: string; onDniChange: (value: string) => void; onNameChange: (value: string) => void; onReasonChange: (value: string) => void }) { return <div className="space-y-3"><label className="block space-y-1.5"><span className="text-sm text-white/65">DNI</span><Input required value={dni} onChange={(event) => onDniChange(event.target.value)} placeholder="40123456" className={fieldClass} /></label><label className="block space-y-1.5"><span className="text-sm text-white/65">Nombre y apellido <span className="text-white/35">(opcional)</span></span><Input value={fullName} onChange={(event) => onNameChange(event.target.value)} placeholder="Nombre y apellido" className={fieldClass} /></label><label className="block space-y-1.5"><span className="text-sm text-white/65">Motivo</span><Input required value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Pelea, prohibido…" className={fieldClass} /></label></div> }

function PhotoPicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) { return <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/[0.14] px-3 py-2.5 text-sm text-white/55 hover:border-white/25 hover:text-white/75"><ImagePlus className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{file ? file.name : "Agregar foto (opcional)"}</span>{file ? <button type="button" onClick={(event) => { event.preventDefault(); onChange(null) }} className="rounded p-1 hover:text-red-400" aria-label="Quitar foto"><X className="h-4 w-4" /></button> : null}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => { onChange(event.target.files?.[0] ?? null); event.target.value = "" }} /></label> }
