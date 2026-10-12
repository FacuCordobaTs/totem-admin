import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

export function TransportLocationPicker({
  value,
  onChange
}: {
  value: { latitude: number; longitude: number } | null
  onChange: (value: { latitude: number; longitude: number }) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const changeRef = useRef(onChange)
  useEffect(() => {
    changeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(
      [-31.663, -60.765],
      13
    )
    mapRef.current = map
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map)
    map.on("click", (e: L.LeafletMouseEvent) =>
      changeRef.current({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    )
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(container.current)
    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !value) return
    const point: L.LatLngExpression = [value.latitude, value.longitude]
    if (markerRef.current) markerRef.current.setLatLng(point)
    else
      markerRef.current = L.circleMarker(point, {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#ff9500",
        fillOpacity: 1
      }).addTo(map)
    map.panTo(point)
  }, [value])
  return (
    <div
      ref={container}
      aria-label="Seleccioná el punto de salida en el mapa"
      className="relative z-0 h-52 w-full rounded-xl"
    />
  )
}
