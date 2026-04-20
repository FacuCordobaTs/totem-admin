import { useCallback, useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import type { ApiEvent } from "@/types/events"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  event: ApiEvent
  onUpdated: () => void
}

export function EventImageUploader({ event, onUpdated }: Props) {
  const token = useAuthStore((s) => s.token)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imageUrl = event.imageUrl?.trim() || null

  const pickFile = useCallback(() => {
    setError(null)
    inputRef.current?.click()
  }, [])

  const upload = useCallback(
    async (file: File) => {
      if (!token) return
      setBusy(true)
      setError(null)
      const fd = new FormData()
      fd.set("image", file)
      try {
        await apiFetch<{ event: ApiEvent }>(`/events/${event.id}/image`, {
          method: "POST",
          token,
          body: fd,
        })
        onUpdated()
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo subir la imagen")
      } finally {
        setBusy(false)
      }
    },
    [token, event.id, onUpdated]
  )

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      void upload(file)
    },
    [upload]
  )

  const remove = useCallback(async () => {
    if (!token || !imageUrl) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch<{ event: ApiEvent }>(`/events/${event.id}/image`, {
        method: "DELETE",
        token,
      })
      onUpdated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo quitar la imagen")
    } finally {
      setBusy(false)
    }
  }, [token, event.id, imageUrl, onUpdated])

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onInputChange}
        aria-hidden
      />

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-950",
          "min-h-[200px] transition-colors duration-200",
          !imageUrl && "flex flex-col items-center justify-center gap-4 px-6 py-14"
        )}
      >
        {busy ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <Loader2 className="h-9 w-9 animate-spin text-[#FF9500]" aria-hidden />
          </div>
        ) : null}

        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={event.name}
              className="max-h-[320px] w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute right-3 top-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || !token}
                onClick={pickFile}
                className="h-9 rounded-lg border border-zinc-600 bg-zinc-900/90 text-[13px] font-semibold text-white shadow-lg backdrop-blur-md hover:bg-zinc-800"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Cambiar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy || !token}
                onClick={() => void remove()}
                className="h-9 rounded-lg bg-red-600/95 text-[13px] font-semibold text-white shadow-lg hover:bg-red-600"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Quitar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 bg-black">
              <ImagePlus className="h-7 w-7 text-zinc-400" strokeWidth={1.25} aria-hidden />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold tracking-tight text-white">
                Imagen del evento
              </p>
              <p className="mt-1 max-w-sm text-[13px] text-zinc-500">
                JPEG, PNG, WebP o GIF · máx. 5 MB
              </p>
            </div>
            <Button
              type="button"
              disabled={busy || !token}
              onClick={pickFile}
              className="h-11 rounded-xl bg-[#FF9500] px-6 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90"
            >
              Subir imagen
            </Button>
          </>
        )}
      </div>

      {imageUrl ? (
        <p className="break-all text-center text-[11px] text-zinc-500">{imageUrl}</p>
      ) : null}
    </div>
  )
}
