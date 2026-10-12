import { useEffect, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"

type PlaceSuggestion = {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

export type LocationCoordinates = { latitude: number; longitude: number }

/** Comparte la búsqueda de direcciones y el mapa del creador de eventos. */
export function LocationPicker({
  id,
  value,
  onChange,
  onSelect,
  coordinates,
  className
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onSelect?: (coordinates: LocationCoordinates) => void
  coordinates?: LocationCoordinates | null
  className: string
}) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 3 || query === value) {
      setSuggestions([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
        if (!response.ok) throw new Error("No se pudieron buscar ubicaciones")
        const places = (await response.json()) as PlaceSuggestion[]
        if (controller.signal.aborted) return
        setSuggestions(places)
        if (places.length === 0) setError("No encontramos ese lugar. Probá con la dirección y la ciudad.")
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setError(error instanceof Error ? error.message : "No se pudieron buscar ubicaciones")
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 350)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, value])

  const select = (place: PlaceSuggestion) => {
    const latitude = Number(place.lat)
    const longitude = Number(place.lon)
    if (onSelect && (!place.lat || !place.lon || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
      setError("No pudimos obtener la ubicación de ese lugar. Elegí otra recomendación.")
      return
    }
    setQuery(place.display_name)
    onChange(place.display_name)
    onSelect?.({ latitude, longitude })
    setSuggestions([])
    setError(null)
  }
  const mapLocation = coordinates ? `${coordinates.latitude},${coordinates.longitude}` : value

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSuggestions([])
            setError(null)
            onChange("")
          }}
          className={className}
          placeholder="Buscá una dirección o lugar"
          autoComplete="off"
        />
        {searching ? <Loader2 className="absolute right-3 top-3 size-5 animate-spin text-white/45" /> : null}
        {suggestions.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                type="button"
                onClick={() => select(place)}
                className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#FF9500]" />
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? <p role="status" className="text-xs text-amber-300">{error}</p> : null}
      {value ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <iframe
            src={`https://maps.google.com/maps?q=${encodeURIComponent(mapLocation)}&z=16&output=embed`}
            title={`Mapa de ${value}`}
            loading="lazy"
            className="h-40 w-full"
          />
        </div>
      ) : (
        <p className="text-xs text-white/40">Elegí una recomendación para confirmar la ubicación y ver el mapa.</p>
      )}
    </div>
  )
}
