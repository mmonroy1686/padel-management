import { normalizePhone } from './championships'
import { formatPhone } from './format'
import type { ParseResult } from './settings'

// Datos del club: what a player sees about the club at the end of Inicio, and the Ajustes form that loads it.

export const AMENITIES = [
  { key: 'lockers', label: 'Vestuarios' },
  { key: 'showers', label: 'Duchas' },
  { key: 'parking', label: 'Estacionamiento' },
  { key: 'bar', label: 'Bar' },
  { key: 'racket_rental', label: 'Alquiler de paletas' },
  { key: 'balls', label: 'Venta de pelotas' },
  { key: 'covered', label: 'Canchas techadas' },
  { key: 'wifi', label: 'Wifi' },
  { key: 'accessible', label: 'Accesible' },
] as const

export type AmenityKey = (typeof AMENITIES)[number]['key']
export type LatLng = { latitude: number; longitude: number }

export const MAX_CLUB_PHOTOS = 8

const AMENITY_KEYS: readonly string[] = AMENITIES.map((amenity) => amenity.key)

export function amenityLabel(key: string): string | null {
  return AMENITIES.find((amenity) => amenity.key === key)?.label ?? null
}

// The same hosts save_club_info takes.
const MAPS_URL = /^https:\/\/((www\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})\/maps([/?]|$)|maps\.google\.(com|[a-z]{2}|com?\.[a-z]{2})\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i

export function isGoogleMapsUrl(url: string): boolean {
  return url.length <= 500 && MAPS_URL.test(url)
}

function validPoint(latitude: number, longitude: number): LatLng | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

const NUMBER = '(-?\\d{1,3}(?:\\.\\d+)?)'
// The place's own pin (!3d…!4d…) comes first: @lat,lng is where the map was centered, which can be off.
const COORDINATE_PATTERNS = [
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(`[?&](?:q|query|ll|destination)=${NUMBER},\\s*${NUMBER}`),
  new RegExp(`@${NUMBER},${NUMBER}`),
]

// The pin in a Google Maps link, when it has one. Short links (maps.app.goo.gl) do not: they are saved as they are and
// the admin marks the pin on the map.
export function mapsCoordinates(url: string): LatLng | null {
  let text = url.trim()
  try {
    text = decodeURIComponent(text)
  } catch {
    // A malformed escape: read the link as it is.
  }
  for (const pattern of COORDINATE_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return validPoint(Number(match[1]), Number(match[2]))
  }
  return null
}

// «Cómo llegar»: the club's own link, or one made from the pin.
export function directionsUrl(club: { google_maps_url: string | null; latitude: number | null; longitude: number | null }): string | null {
  if (club.google_maps_url) return club.google_maps_url
  if (club.latitude === null || club.longitude === null) return null
  return `https://www.google.com/maps/search/?api=1&query=${club.latitude},${club.longitude}`
}

// Country of each time zone the platform offers: the calling code for wa.me and the code Nominatim narrows to.
// center is where the Ajustes map starts before the club has a pin: the capital.
const COUNTRIES: Record<string, { calling: string; iso: string; center: LatLng }> = {
  'America/Montevideo': { calling: '598', iso: 'uy', center: { latitude: -34.9058, longitude: -56.1913 } },
  'America/Argentina/Buenos_Aires': { calling: '54', iso: 'ar', center: { latitude: -34.6037, longitude: -58.3816 } },
  'America/Asuncion': { calling: '595', iso: 'py', center: { latitude: -25.2637, longitude: -57.5759 } },
  'America/Santiago': { calling: '56', iso: 'cl', center: { latitude: -33.4489, longitude: -70.6693 } },
  'America/Sao_Paulo': { calling: '55', iso: 'br', center: { latitude: -23.5505, longitude: -46.6333 } },
}

export function mapStart(timezone: string): LatLng {
  return COUNTRIES[timezone]?.center ?? COUNTRIES['America/Montevideo'].center
}

export function countryCode(timezone: string): string | null {
  return COUNTRIES[timezone]?.iso ?? null
}

// A phone saved local (092369558) as wa.me wants it, international: the leading 0 becomes the country's code.
export function internationalPhone(phone: string, timezone: string): string {
  const calling = COUNTRIES[timezone]?.calling
  return calling && phone.startsWith('0') ? `${calling}${phone.slice(1)}` : phone
}

// The club's chat.
export function whatsappUrl(phone: string, timezone: string, clubName: string): string {
  const international = internationalPhone(phone, timezone)
  const text = `Hola, les escribo desde la app de ${clubName}.`
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`
}

export function instagramUrl(user: string): string {
  return `https://instagram.com/${user}`
}

const INSTAGRAM_USER = /^[a-z0-9._]{1,30}$/

// What the admin types: "rustic.padel", "@rustic.padel" or the profile link. '' is none; null is not a user name.
export function readInstagram(raw: string): string | null | '' {
  let text = raw.trim()
  if (text === '') return ''
  const link = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i.exec(text)
  if (link) text = link[1]
  text = text.replace(/^@/, '').toLowerCase()
  return INSTAGRAM_USER.test(text) ? text : null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type ClubInfoInput = {
  address: string | null
  latitude: number | null
  longitude: number | null
  googleMapsUrl: string | null
  phone: string | null
  instagram: string | null
  contactEmail: string | null
  amenities: AmenityKey[]
}

function text(form: FormData, name: string): string {
  const raw = form.get(name)
  return typeof raw === 'string' ? raw.trim() : ''
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Ajustes → "Datos del club": the form as save_club_info takes it, with a message for each wrong field.
export function parseClubInfoForm(form: FormData): ParseResult<ClubInfoInput> {
  const address = text(form, 'address')
  if (address.length > 200) return fail('La dirección es muy larga: hasta 200 caracteres.')

  const rawLatitude = text(form, 'latitude')
  const rawLongitude = text(form, 'longitude')
  let point: LatLng | null = null
  if (rawLatitude !== '' || rawLongitude !== '') {
    point = rawLatitude !== '' && rawLongitude !== '' ? validPoint(Number(rawLatitude), Number(rawLongitude)) : null
    if (!point) return fail('Marcá la ubicación de nuevo en el mapa.')
  }

  const googleMapsUrl = text(form, 'google_maps_url')
  if (googleMapsUrl !== '' && !isGoogleMapsUrl(googleMapsUrl)) {
    return fail('Pegá el link que da Google Maps al compartir el lugar (empieza con https://maps.app.goo.gl o https://www.google.com/maps).')
  }

  const rawPhone = text(form, 'phone')
  const phone = rawPhone === '' ? null : rawPhone.length <= 30 ? normalizePhone(rawPhone) : null
  if (rawPhone !== '' && !phone) return fail('Revisá el WhatsApp: tiene que tener entre 8 y 15 números.')

  const instagram = readInstagram(text(form, 'instagram'))
  if (instagram === null) return fail('Revisá el Instagram: el usuario lleva letras, números, puntos y guiones bajos.')

  const contactEmail = text(form, 'contact_email').toLowerCase()
  if (contactEmail !== '' && (contactEmail.length > 200 || !EMAIL.test(contactEmail))) {
    return fail('Revisá el email: tiene que ser como nombre@dominio.com.')
  }

  const given = form.getAll('amenities').filter((value): value is string => typeof value === 'string')
  if (given.some((value) => !AMENITY_KEYS.includes(value))) return fail('Elegí los servicios de la lista.')
  const amenities = AMENITIES.map((amenity) => amenity.key).filter((key) => given.includes(key))

  return {
    ok: true,
    value: {
      address: address || null,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      googleMapsUrl: googleMapsUrl || null,
      phone,
      instagram: instagram || null,
      contactEmail: contactEmail || null,
      amenities,
    },
  }
}

export type ClubInfoClub = {
  name: string
  timezone: string
  address: string | null
  latitude: number | null
  longitude: number | null
  google_maps_url: string | null
  phone: string | null
  instagram: string | null
  contact_email: string | null
  amenities: string[]
  opens_at: string
  closes_at: string
}

export type ClubContact = { kind: 'whatsapp' | 'instagram' | 'email'; label: string; href: string; detail: string }

export type ClubInfoView = {
  photos: string[]
  address: string | null
  pin: LatLng | null
  directions: string | null
  contacts: ClubContact[]
  amenities: string[]
  hours: string
}

// «El club» on Inicio: only what the club loaded. null when it loaded nothing, so the section does not show.
export function clubInfoView(club: ClubInfoClub, photoUrls: string[]): ClubInfoView | null {
  const pin = club.latitude !== null && club.longitude !== null ? { latitude: club.latitude, longitude: club.longitude } : null
  const contacts: ClubContact[] = [
    ...(club.phone
      ? [{ kind: 'whatsapp' as const, label: 'WhatsApp', href: whatsappUrl(club.phone, club.timezone, club.name), detail: formatPhone(club.phone) }]
      : []),
    ...(club.instagram
      ? [{ kind: 'instagram' as const, label: 'Instagram', href: instagramUrl(club.instagram), detail: `@${club.instagram}` }]
      : []),
    ...(club.contact_email
      ? [{ kind: 'email' as const, label: 'Email', href: `mailto:${club.contact_email}`, detail: club.contact_email }]
      : []),
  ]
  const amenities = club.amenities.map(amenityLabel).filter((label): label is string => label !== null)
  const directions = directionsUrl(club)
  if (photoUrls.length === 0 && !club.address && !pin && !directions && contacts.length === 0 && amenities.length === 0) {
    return null
  }
  return {
    photos: photoUrls,
    address: club.address,
    pin,
    directions,
    contacts,
    amenities,
    hours: `Abierto de ${club.opens_at.slice(0, 5)} a ${club.closes_at.slice(0, 5)}`,
  }
}

export type MapTiles = { url: string; attribution: string }

export const OPENSTREETMAP_TILES: MapTiles = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

// Where the map images come from: NEXT_PUBLIC_MAP_TILES_URL and NEXT_PUBLIC_MAP_ATTRIBUTION (README, «Mapa del
// club»). Without them, or with a URL that is not an https tile template, OpenStreetMap's public servers: fine for
// development and the pilot, not for a commercial app with traffic.
export function mapTiles(env: { url?: string; attribution?: string }): MapTiles {
  const url = env.url?.trim() ?? ''
  if (!url.startsWith('https://') || !['{z}', '{x}', '{y}'].every((part) => url.includes(part))) return OPENSTREETMAP_TILES
  return { url, attribution: env.attribution?.trim() ?? '' }
}

// Nominatim (OpenStreetMap's search), one request per click of «Buscar en el mapa», narrowed to the club's country.
export function nominatimUrl(query: string, timezone: string): string {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })
  const country = countryCode(timezone)
  if (country) params.set('countrycodes', country)
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`
}

export function nominatimPoint(body: unknown): LatLng | null {
  if (!Array.isArray(body) || body.length === 0) return null
  const first = body[0] as { lat?: unknown; lon?: unknown }
  if (typeof first.lat !== 'string' || typeof first.lon !== 'string') return null
  return validPoint(Number(first.lat), Number(first.lon))
}
