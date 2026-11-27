import { describe, expect, it } from 'vitest'
import { clubSummary, isPlatformHost, parseNewClubForm, suggestSlug, TIMEZONES, type PlatformClub } from '@/lib/domain/platform'
import { platformClub } from '../../fixtures/platform'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('suggestSlug', () => {
  it('turns a club name into a subdomain', () => {
    expect(suggestSlug('Pádel Norte')).toBe('padel-norte')
    expect(suggestSlug('  Club   Ñandú & Cía. ')).toBe('club-nandu-cia')
    expect(suggestSlug('---')).toBe('')
    expect(suggestSlug('a'.repeat(50))).toHaveLength(40)
  })
})

describe('parseNewClubForm', () => {
  const valid = { name: ' Club Demo ', slug: ' Demo ', timezone: 'America/Montevideo', adminEmail: ' Admin@Demo.UY ' }

  it('takes the name, slug, time zone and admin email', () => {
    expect(parseNewClubForm(form(valid))).toEqual({
      ok: true,
      value: { name: 'Club Demo', slug: 'demo', timezone: 'America/Montevideo', adminEmail: 'admin@demo.uy' },
    })
  })

  it('explains each missing or wrong field', () => {
    expect(parseNewClubForm(form({ ...valid, name: ' ' }))).toEqual({ ok: false, message: 'Poné el nombre del club.' })
    expect(parseNewClubForm(form({ ...valid, slug: 'club demo' }))).toEqual({
      ok: false,
      message: 'Usá letras minúsculas, números y guiones, de 2 a 40 caracteres.',
    })
    expect(parseNewClubForm(form({ ...valid, timezone: 'Europe/Madrid' }))).toEqual({
      ok: false,
      message: 'Elegí una zona horaria de la lista.',
    })
    expect(parseNewClubForm(form({ ...valid, adminEmail: 'admin' }))).toEqual({
      ok: false,
      message: 'Revisá el email: tiene que ser como nombre@dominio.com.',
    })
  })

  it('offers the time zones of the region, Montevideo first', () => {
    expect(TIMEZONES[0]).toEqual({ id: 'America/Montevideo', label: 'Montevideo' })
    expect(TIMEZONES.map((zone) => zone.label)).toEqual(['Montevideo', 'Buenos Aires', 'Asunción', 'Santiago', 'São Paulo'])
  })
})

describe('isPlatformHost', () => {
  it('opens the platform only on PLATFORM_HOST', () => {
    expect(isPlatformHost('localhost:3000', { PLATFORM_HOST: 'localhost:3000' })).toBe(true)
    expect(isPlatformHost('Padel.Vercel.App', { PLATFORM_HOST: 'padel.vercel.app' })).toBe(true)
    expect(isPlatformHost('padel.vercel.app:443', { PLATFORM_HOST: 'padel.vercel.app' })).toBe(true)
    expect(isPlatformHost('rustic.localhost:3000', { PLATFORM_HOST: 'localhost:3000' })).toBe(false)
    expect(isPlatformHost('localhost:3000', {})).toBe(false)
    expect(isPlatformHost(null, { PLATFORM_HOST: 'localhost:3000' })).toBe(false)
  })
})

describe('clubSummary', () => {
  const now = new Date('2026-11-24T12:00:00Z')
  const club: PlatformClub = platformClub()

  it('counts courts, staff and last week bookings, and says it is ready', () => {
    expect(clubSummary(club, now)).toEqual({ state: 'Listo', details: '3 canchas · 2 staff · 41 reservas en 7 días' })
  })

  it('says when the admin has not come in yet, or the invitation ran out', () => {
    const fresh = { ...club, setupCompletedAt: null, activeCourts: 0, staff: 0, bookingsLastWeek: 0 }
    expect(clubSummary({ ...fresh, adminInvitationExpiresAt: new Date('2026-11-30T12:00:00Z') }, now)).toEqual({
      state: 'Invitación pendiente',
      details: 'Sin canchas · sin staff · 0 reservas en 7 días',
    })
    expect(clubSummary({ ...fresh, adminInvitationExpiresAt: new Date('2026-11-20T12:00:00Z') }, now).state).toBe(
      'Invitación vencida',
    )
  })

  it('says the admin is setting it up, with one court in the singular', () => {
    expect(clubSummary({ ...club, setupCompletedAt: null, activeCourts: 1, staff: 1, bookingsLastWeek: 1 }, now)).toEqual({
      state: 'Configurando',
      details: '1 cancha · 1 staff · 1 reserva en 7 días',
    })
  })
})
