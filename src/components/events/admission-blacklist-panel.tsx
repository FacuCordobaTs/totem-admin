import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import {
  Ban,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"

/**
 * Tarea 3.3 — ABM de blacklist / registro de admisión (visión §2.4).
 * Listado + alta (DNI, nombre, motivo, foto opcional), edición inline, activar/desactivar,
 * quitar foto y eliminar. La puerta (ScannerPage) ya chequea `findActiveBlacklistEntry` al
 * validar: cargar acá una persona hace que su entrada (o su DNI) se rechace con motivo + foto.
 * La foto se adjunta por separado (`POST .../:entryId/image`, multipart "image" — misma
 * convención que el uploader del evento): el alta crea y, si se eligió archivo, sube después.
 */
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

const fieldClass =
  "h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[15px] text-white outline-none transition-colors focus:border-white/25"

export function AdmissionBlacklistPanel({
  eventId,
  refreshTrigger,
  onChanged,
}: {
  eventId: string
  refreshTrigger: number
  onChanged?: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.staff?.role)
  const canManage = role === "ADMIN" || role === "MANAGER"

  const [entries, setEntries] = useState<BlacklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Alta
  const [open, setOpen] = useState(false)
  const [dni, setDni] = useState("")
  const [fullName, setFullName] = useState("")
  const [reason, setReason] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDni, setEditDni] = useState("")
  const [editName, setEditName] = useState("")
  const [editReason, setEditReason] = useState("")

  // Foto de una fila: un solo input oculto compartido; `photoTargetId` dice a quién se sube.
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch<BlacklistResponse>(`/events/${eventId}/blacklist`, {
        method: "GET",
        token,
      })
      setEntries(res.entries)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo cargar el registro de admisión"
      )
    } finally {
      setLoading(false)
    }
  }, [token, eventId])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  async function uploadPhoto(entryId: string, file: File) {
    if (!token) return
    setBusyId(entryId)
    setError(null)
    try {
      const fd = new FormData()
      fd.set("image", file)
      await apiFetch<EntryResponse>(
        `/events/${eventId}/blacklist/${entryId}/image`,
        { method: "POST", token, body: fd }
      )
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo subir la foto")
    } finally {
      setBusyId(null)
    }
  }

  async function create() {
    if (!token || saving) return
    if (dni.trim() === "") {
      setFormError("Poné el DNI de la persona")
      return
    }
    if (reason.trim() === "") {
      setFormError("Poné el motivo")
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      const res = await apiFetch<EntryResponse>(`/events/${eventId}/blacklist`, {
        method: "POST",
        token,
        body: JSON.stringify({
          dni: dni.trim(),
          fullName: fullName.trim() || null,
          reason: reason.trim(),
        }),
      })
      if (photoFile) await uploadPhoto(res.entry.id, photoFile)
      setDni("")
      setFullName("")
      setReason("")
      setPhotoFile(null)
      await load()
      onChanged?.()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo agregar la persona")
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry: BlacklistEntry) {
    setEditingId(entry.id)
    setEditDni(entry.dni)
    setEditName(entry.fullName ?? "")
    setEditReason(entry.reason)
  }

  async function saveEdit(id: string) {
    if (!token) return
    if (editDni.trim() === "" || editReason.trim() === "") {
      setError("El DNI y el motivo no pueden quedar vacíos")
      return
    }
    setBusyId(id)
    setError(null)
    try {
      await apiFetch<EntryResponse>(`/events/${eventId}/blacklist/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          dni: editDni.trim(),
          fullName: editName.trim() || null,
          reason: editReason.trim(),
        }),
      })
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar")
    } finally {
      setBusyId(null)
    }
  }

  async function removePhoto(entryId: string) {
    if (!token) return
    setBusyId(entryId)
    setError(null)
    try {
      await apiFetch<EntryResponse>(`/events/${eventId}/blacklist/${entryId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ photoUrl: null }),
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo quitar la foto")
    } finally {
      setBusyId(null)
    }
  }

  async function toggle(id: string, nextActive: boolean) {
    if (!token) return
    setBusyId(id)
    setError(null)
    try {
      await apiFetch<EntryResponse>(`/events/${eventId}/blacklist/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: nextActive }),
      })
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string, name: string) {
    if (!token) return
    if (!confirm(`¿Eliminar a ${name} del registro de admisión?`)) return
    setBusyId(id)
    try {
      await apiFetch(`/events/${eventId}/blacklist/${id}`, {
        method: "DELETE",
        token,
      })
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar")
    } finally {
      setBusyId(null)
    }
  }

  function pickPhotoFor(id: string) {
    setError(null)
    setPhotoTargetId(id)
    photoInputRef.current?.click()
  }

  const onPhotoInput = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || !photoTargetId) return
      await uploadPhoto(photoTargetId, file)
    },
    [photoTargetId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (!canManage) return null

  const activeCount = entries.filter((e) => e.isActive).length

  return (
    <section className="w-full">
      {/* Input de foto compartido por todas las filas */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onPhotoInput}
        aria-hidden
      />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-white/40" />
          <h3 className="text-[17px] font-medium text-foreground">
            Registro de admisión
          </h3>
          {activeCount > 0 ? (
            <span className="text-[13px] text-white/35">· {activeCount} activa(s)</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[13px] text-white/50 transition-colors hover:text-white/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>

      {open ? (
        <div className="mb-3 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="DNI (ej. 40123456)"
              className={cn(fieldClass, "w-40 min-w-[140px]")}
            />
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre y apellido (opcional)"
              className={cn(fieldClass, "min-w-[160px] flex-1")}
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (ej. pelea, prohibido)"
              className={cn(fieldClass, "min-w-[160px] flex-1")}
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={saving}
              className="h-10 shrink-0 rounded-lg bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {saving ? "…" : "Agregar"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-white/50 transition-colors hover:text-white/80">
              <ImagePlus className="h-4 w-4" />
              {photoFile ? (
                <span className="max-w-[220px] truncate text-white/70">
                  {photoFile.name}
                </span>
              ) : (
                "Foto (opcional)"
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  setPhotoFile(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
                aria-hidden
              />
            </label>
            {photoFile ? (
              <button
                type="button"
                onClick={() => setPhotoFile(null)}
                className="inline-flex items-center gap-1 text-[12px] text-white/40 transition-colors hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </button>
            ) : null}
          </div>
          {formError ? <p className="text-[12px] text-red-400">{formError}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="py-2 text-[14px] text-red-400">{error}</p>
      ) : loading ? (
        <p className="py-2 text-[14px] text-white/40">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="py-2 text-[14px] text-white/35">
          Sin entradas. Al escanear la entrada o el DNI de una persona cargada acá, la puerta
          avisa con el motivo y la foto.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              busy={busyId === entry.id}
              editing={editingId === entry.id}
              editDni={editDni}
              editName={editName}
              editReason={editReason}
              onEditDniChange={setEditDni}
              onEditNameChange={setEditName}
              onEditReasonChange={setEditReason}
              onStartEdit={() => startEdit(entry)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => void saveEdit(entry.id)}
              onToggle={(next) => void toggle(entry.id, next)}
              onDelete={() => void remove(entry.id, entry.fullName?.trim() || entry.dni)}
              onPickPhoto={() => pickPhotoFor(entry.id)}
              onRemovePhoto={() => void removePhoto(entry.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function EntryRow({
  entry,
  busy,
  editing,
  editDni,
  editName,
  editReason,
  onEditDniChange,
  onEditNameChange,
  onEditReasonChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggle,
  onDelete,
  onPickPhoto,
  onRemovePhoto,
}: {
  entry: BlacklistEntry
  busy: boolean
  editing: boolean
  editDni: string
  editName: string
  editReason: string
  onEditDniChange: (v: string) => void
  onEditNameChange: (v: string) => void
  onEditReasonChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onToggle: (nextActive: boolean) => void
  onDelete: () => void
  onPickPhoto: () => void
  onRemovePhoto: () => void
}) {
  const name = entry.fullName?.trim() || "Sin nombre"

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-[#FF9500]/25 bg-[#FF9500]/[0.04] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={editDni}
            onChange={(e) => onEditDniChange(e.target.value)}
            placeholder="DNI"
            className={cn(fieldClass, "w-40")}
          />
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            placeholder="Nombre y apellido"
            className={cn(fieldClass, "min-w-[160px] flex-1")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={editReason}
            onChange={(e) => onEditReasonChange(e.target.value)}
            placeholder="Motivo"
            className={cn(fieldClass, "min-w-[160px] flex-1")}
          />
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={busy}
            className="h-10 shrink-0 rounded-lg bg-[#FF9500] px-4 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="h-10 shrink-0 rounded-lg border border-white/[0.1] px-4 text-[14px] font-semibold text-white/60 transition-colors hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5",
        !entry.isActive && "opacity-50"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06]">
        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <User className="h-5 w-5 text-white/30" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white">{name}</p>
        <p className="truncate text-[12px] text-white/40">
          DNI {entry.dni} · {entry.reason}
        </p>
      </div>

      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          entry.isActive
            ? "border-red-400/25 bg-red-400/[0.08] text-red-300"
            : "border-white/[0.1] bg-white/[0.04] text-white/40"
        )}
      >
        {entry.isActive ? "Activa" : "Desactivada"}
      </span>

      <Switch
        checked={entry.isActive}
        onCheckedChange={onToggle}
        disabled={busy}
        aria-label={entry.isActive ? "Desactivar entrada" : "Activar entrada"}
      />

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-white/40" aria-hidden />
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPickPhoto}
            className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-white"
            aria-label="Subir o reemplazar foto"
            title="Foto"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          {entry.photoUrl ? (
            <button
              type="button"
              onClick={onRemovePhoto}
              className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-red-400"
              aria-label="Quitar foto"
              title="Quitar foto"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-white"
            aria-label="Editar"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/[0.05] hover:text-red-400"
            aria-label="Eliminar"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
