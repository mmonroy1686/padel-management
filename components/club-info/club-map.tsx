'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { type LatLng, mapTiles } from '@/lib/domain/club-info'

// Spelled out so Next inlines them in the browser bundle.
const TILES = mapTiles({ url: process.env.NEXT_PUBLIC_MAP_TILES_URL, attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION })

export type ClubMapProps = {
  pin: LatLng | null
  // Where the map starts when there is no pin yet.
  fallback: LatLng
  mode: 'edit' | 'view'
  label: string
  onPick?: (point: LatLng) => void
}

// A pin drawn with CSS: Leaflet's own marker images do not survive the bundler.
const PIN = L.divIcon({
  className: '',
  html: '<span class="block h-6 w-6 -translate-y-3 rotate-45 rounded-[50%_50%_50%_0] border-2 border-white bg-accent shadow-md"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
})

function Recenter({ pin }: { pin: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (pin) map.setView([pin.latitude, pin.longitude], Math.max(map.getZoom(), 16))
  }, [map, pin])
  return null
}

function PickOnClick({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({ click: (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
  return null
}

// Leaflet with the configured tiles (OpenStreetMap by default, no key). edit: tapping the map or dragging the pin moves it. view: only shows it,
// without wheel zoom or one-finger drag, so scrolling Inicio does not move the map by accident.
export default function ClubMap({ pin, fallback, mode, label, onPick }: ClubMapProps) {
  const editing = mode === 'edit'
  const center = pin ?? fallback
  const handlers = useMemo(
    () => ({
      dragend: (event: L.DragEndEvent) => {
        const point = (event.target as L.Marker).getLatLng()
        onPick?.({ latitude: point.lat, longitude: point.lng })
      },
    }),
    [onPick],
  )

  return (
    <div role="region" aria-label={label} className="isolate overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={pin ? 16 : 12}
        scrollWheelZoom={false}
        dragging={editing || !L.Browser.mobile}
        className={editing ? 'h-72 w-full' : 'h-48 w-full'}
      >
        <TileLayer url={TILES.url} attribution={TILES.attribution} maxZoom={19} />
        <Recenter pin={pin} />
        {editing && onPick ? <PickOnClick onPick={onPick} /> : null}
        {pin ? (
          <Marker position={[pin.latitude, pin.longitude]} icon={PIN} draggable={editing} eventHandlers={handlers} />
        ) : null}
      </MapContainer>
    </div>
  )
}
