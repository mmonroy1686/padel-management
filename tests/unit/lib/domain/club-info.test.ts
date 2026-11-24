import { describe, expect, it } from 'vitest'
import {
  clubInfoView,
  directionsUrl,
  isGoogleMapsUrl,
  mapsCoordinates,
  nominatimPoint,
  nominatimUrl,
  parseClubInfoForm,
  readInstagram,
  whatsappUrl,
  type ClubInfoClub,
} from '@/lib/domain/club-info'
import { clubPhotoPath, isClubPhotoPath } from '@/lib/domain/club-logo'

const CLUB = 'a0000000-0000-0000-0000-000000000001'

describe('mapsCoordinates', () => {
  it('reads the place pin of a long link before where the map was centered', () => {
    expect(
      mapsCoordinates('https://www.google.com/maps/place/Rustic/@-34.90,-56.10,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d-34.9011!4d-56.1645'),
    ).toEqual({ latitude: -34.9011, longitude: -56.1645 })
  })

  it('reads @lat,lng', () => {
    expect(mapsCoordinates('https://www.google.com/maps/@-34.8,-56.2,15z')).toEqual({ latitude: -34.8, longitude: -56.2 })
  })

  it('reads ?q=lat,lng and query=, also escaped', () => {
    expect(mapsCoordinates('https://maps.google.com/?q=-34.9,-56.16')).toEqual({ latitude: -34.9, longitude: -56.16 })
    expect(mapsCoordinates('https://www.google.com/maps/search/?api=1&query=-34.9%2C-56.16')).toEqual({ latitude: -34.9, longitude: -56.16 })
  })

  it('finds nothing in a short link or out of range', () => {
    expect(mapsCoordinates('https://maps.app.goo.gl/AbC123')).toBeNull()
    expect(mapsCoordinates('https://www.google.com/maps/@95,-56,15z')).toBeNull()
  })
})

describe('isGoogleMapsUrl', () => {
  it('takes the links Google gives and nothing else', () => {
    expect(isGoogleMapsUrl('https://maps.app.goo.gl/AbC123')).toBe(true)
    expect(isGoogleMapsUrl('https://www.google.com.uy/maps/place/x')).toBe(true)
    expect(isGoogleMapsUrl('https://goo.gl/maps/x')).toBe(true)
    expect(isGoogleMapsUrl('http://maps.app.goo.gl/x')).toBe(false)
    expect(isGoogleMapsUrl('https://evil.example/maps.app.goo.gl/')).toBe(false)
  })
})

describe('directionsUrl', () => {
  it('uses the club link, or one made from the pin', () => {
    expect(directionsUrl({ google_maps_url: 'https://maps.app.goo.gl/x', latitude: 1, longitude: 2 })).toBe('https://maps.app.goo.gl/x')
    expect(directionsUrl({ google_maps_url: null, latitude: -34.9, longitude: -56.1 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-34.9,-56.1',
    )
    expect(directionsUrl({ google_maps_url: null, latitude: null, longitude: null })).toBeNull()
  })
})

describe('whatsappUrl', () => {
  it('turns the local phone international with a greeting', () => {
    expect(whatsappUrl('092369558', 'America/Montevideo', 'Rustic')).toBe(
      `https://wa.me/59892369558?text=${encodeURIComponent('Hola, les escribo desde la app de Rustic.')}`,
    )
    expect(whatsappUrl('01155556666', 'America/Argentina/Buenos_Aires', 'X')).toMatch(/^https:\/\/wa\.me\/541155556666\?/)
  })

  it('leaves an international number as it is', () => {
    expect(whatsappUrl('5491155556666', 'America/Argentina/Buenos_Aires', 'X')).toMatch(/^https:\/\/wa\.me\/5491155556666\?/)
  })
})

describe('readInstagram', () => {
  it('takes the user, with @ or as a link', () => {
    expect(readInstagram('@Rustic.Padel')).toBe('rustic.padel')
    expect(readInstagram('https://www.instagram.com/rustic_padel/?hl=es')).toBe('rustic_padel')
    expect(readInstagram('  ')).toBe('')
    expect(readInstagram('no spaces')).toBeNull()
  })
})

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) data.append(name, item)
  return data
}

describe('parseClubInfoForm', () => {
  it('reads the whole form', () => {
    expect(
      parseClubInfoForm(
        form({
          address: ' Av. Italia 1234 ',
          latitude: '-34.9',
          longitude: '-56.1',
          google_maps_url: 'https://maps.app.goo.gl/x',
          phone: '+598 92 369 558',
          instagram: '@rustic',
          contact_email: 'Hola@Rustic.uy',
          amenities: ['wifi', 'bar'],
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        address: 'Av. Italia 1234',
        latitude: -34.9,
        longitude: -56.1,
        googleMapsUrl: 'https://maps.app.goo.gl/x',
        phone: '092369558',
        instagram: 'rustic',
        contactEmail: 'hola@rustic.uy',
        amenities: ['bar', 'wifi'],
      },
    })
  })

  it('leaves out what is empty', () => {
    expect(parseClubInfoForm(form({ address: '', latitude: '', longitude: '' }))).toEqual({
      ok: true,
      value: { address: null, latitude: null, longitude: null, googleMapsUrl: null, phone: null, instagram: null, contactEmail: null, amenities: [] },
    })
  })

  it.each([
    [{ latitude: '-34.9' }, 'Marcá la ubicación'],
    [{ latitude: '200', longitude: '1' }, 'Marcá la ubicación'],
    [{ google_maps_url: 'https://example.com' }, 'Pegá el link'],
    [{ phone: '12' }, 'Revisá el WhatsApp'],
    [{ instagram: 'a b' }, 'Revisá el Instagram'],
    [{ contact_email: 'nope' }, 'Revisá el email'],
    [{ amenities: 'pool' }, 'Elegí los servicios'],
    [{ address: 'a'.repeat(201) }, 'La dirección es muy larga'],
  ])('says what is wrong with %o', (fields, message) => {
    const result = parseClubInfoForm(form(fields))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(message)
  })
})

const EMPTY: ClubInfoClub = {
  name: 'Rustic',
  timezone: 'America/Montevideo',
  address: null,
  latitude: null,
  longitude: null,
  google_maps_url: null,
  phone: null,
  instagram: null,
  contact_email: null,
  amenities: [],
  opens_at: '08:00:00',
  closes_at: '23:00:00',
}

describe('clubInfoView', () => {
  it('is nothing when the club loaded nothing', () => {
    expect(clubInfoView(EMPTY, [])).toBeNull()
  })

  it('shows only what is loaded', () => {
    const view = clubInfoView({ ...EMPTY, phone: '092369558', amenities: ['wifi', 'gone'] }, [])
    expect(view).toMatchObject({ photos: [], address: null, pin: null, directions: null, amenities: ['Wifi'], hours: 'Abierto de 08:00 a 23:00' })
    expect(view?.contacts.map((contact) => [contact.kind, contact.detail])).toEqual([['whatsapp', '092 369 558']])
  })

  it('has every part with everything loaded', () => {
    const view = clubInfoView(
      { ...EMPTY, address: 'Av. Italia 1234', latitude: -34.9, longitude: -56.1, instagram: 'rustic', contact_email: 'hola@rustic.uy', phone: '092369558' },
      ['https://x/1.jpg'],
    )
    expect(view?.pin).toEqual({ latitude: -34.9, longitude: -56.1 })
    expect(view?.directions).toContain('query=-34.9,-56.1')
    expect(view?.contacts.map((contact) => contact.href)).toEqual([
      expect.stringMatching(/^https:\/\/wa\.me\/59892369558/),
      'https://instagram.com/rustic',
      'mailto:hola@rustic.uy',
    ])
  })
})

describe('nominatim', () => {
  it('searches in the club country', () => {
    const url = new URL(nominatimUrl('Av. Italia 1234', 'America/Montevideo'))
    expect([url.host, url.searchParams.get('q'), url.searchParams.get('countrycodes'), url.searchParams.get('limit')]).toEqual([
      'nominatim.openstreetmap.org',
      'Av. Italia 1234',
      'uy',
      '1',
    ])
  })

  it('reads the first result', () => {
    expect(nominatimPoint([{ lat: '-34.9', lon: '-56.1' }])).toEqual({ latitude: -34.9, longitude: -56.1 })
    expect(nominatimPoint([])).toBeNull()
    expect(nominatimPoint({ error: 'x' })).toBeNull()
  })
})

describe('club photo paths', () => {
  it('go in the club folder as photo-<ts>.jpg', () => {
    expect(clubPhotoPath(CLUB, 123)).toBe(`${CLUB}/photo-123.jpg`)
    expect(isClubPhotoPath(CLUB, `${CLUB}/photo-123.jpg`)).toBe(true)
    expect(isClubPhotoPath(CLUB, `other/photo-123.jpg`)).toBe(false)
    expect(isClubPhotoPath(CLUB, `${CLUB}/logo-123.png`)).toBe(false)
  })
})
