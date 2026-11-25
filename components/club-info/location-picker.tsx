'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { mapsCoordinates, nominatimPoint, nominatimUrl, type LatLng } from '@/lib/domain/club-info'
import { LazyClubMap } from './lazy-club-map'

export type LocationPickerProps = {
  address: string | null
  pin: LatLng | null
  googleMapsUrl: string | null
  timezone: string
  start: LatLng
  // Injected in tests; the browser's fetch otherwise.
  search?: (url: string) => Promise<unknown>
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  return response.ok ? response.json() : null
}

// Ajustes → "Datos del club" → Ubicación. Three ways to place the pin: tap (or drag) on the map, paste a Google Maps
// link that carries coordinates, or search the address. The pin travels in hidden inputs with the rest of the form.
export function LocationPicker({ address, pin: initialPin, googleMapsUrl, timezone, start, search = fetchJson }: LocationPickerProps) {
  const [pin, setPin] = useState<LatLng | null>(initialPin)
  const [addressText, setAddressText] = useState(address ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  function onLink(value: string) {
    if (value.trim() === '') return setNote(null)
    const point = mapsCoordinates(value)
    if (point) {
      setPin(point)
      setNote('Movimos el pin al lugar del link.')
    } else {
      setNote('Ese link no trae la ubicación: se guarda igual, marcá el pin tocando el mapa.')
    }
  }

  async function onSearch() {
    if (addressText.trim().length < 3) return setNote('Escribí la dirección para buscarla.')
    setSearching(true)
    try {
      const point = nominatimPoint(await search(nominatimUrl(addressText.trim(), timezone)))
      setNote(point ? 'Encontramos la dirección: revisá que el pin esté en la puerta.' : 'No encontramos esa dirección. Marcá el pin tocando el mapa.')
      if (point) setPin(point)
    } catch {
      setNote('No pudimos buscar ahora. Marcá el pin tocando el mapa.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Dirección" htmlFor="club-address">
        <input id="club-address" name="address" maxLength={200} autoComplete="street-address" value={addressText}
          onChange={(event) => setAddressText(event.target.value)} placeholder="Av. Italia 1234, Montevideo" className={inputClasses} />
      </Field>
      <Button variant="secondary" onClick={onSearch} disabled={searching}>
        {searching ? 'Buscando…' : 'Buscar en el mapa'}
      </Button>
      <LazyClubMap pin={pin} fallback={start} mode="edit" label="Mapa para marcar el club" onPick={setPin} />
      <p className="text-sm text-fg-muted">Tocá el mapa o arrastrá el pin para marcar la entrada del club.</p>
      <input type="hidden" name="latitude" value={pin?.latitude ?? ''} />
      <input type="hidden" name="longitude" value={pin?.longitude ?? ''} />
      <Field label="Link de Google Maps" htmlFor="club-maps" hint="En Google Maps: Compartir → Copiar vínculo. Es el que abre «Cómo llegar».">
        <input id="club-maps" name="google_maps_url" type="url" inputMode="url" maxLength={500} defaultValue={googleMapsUrl ?? ''}
          onChange={(event) => onLink(event.target.value)} aria-describedby="club-maps-hint" placeholder="https://maps.app.goo.gl/…"
          className={inputClasses} />
      </Field>
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
      {pin ? (
        <Button variant="ghost" onClick={() => { setPin(null); setNote('Sacamos el pin. Guardá para que no se vea el mapa.') }}>
          Quitar ubicación
        </Button>
      ) : null}
    </div>
  )
}
