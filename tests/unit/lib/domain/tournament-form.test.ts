import { describe, expect, it } from 'vitest'
import { busyCourtIds, fitsOpeningHours, parseTournamentForm, tournamentPeriod } from '@/lib/domain/tournament-form'
import { at, TIMEZONE } from '../../fixtures/grid'

const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const C3 = '22222222-2222-2222-2222-222222222203'
const VALID: Record<string, string | string[]> = {
  name: ' Americano de octubre ',
  date: '2026-10-01',
  time: '18:00',
  courtIds: [C1, C2],
  maxPlayers: '8',
  pointsPerGame: '24',
  roundMinutes: '20',
  rounds: '7',
  categoryMin: '4',
  categoryMax: '6',
  type: 'mixed',
  price: '400',
}

function tournamentForm(overrides: Record<string, string | string[]> = {}): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item)
  }
  return form
}

const messageOf = (overrides: Record<string, string | string[]>) => {
  const result = parseTournamentForm(tournamentForm(overrides), TIMEZONE)
  return result.ok ? null : result.message
}

describe('parseTournamentForm', () => {
  it('reads a valid americano, with the start on the club clock', () => {
    expect(parseTournamentForm(tournamentForm(), TIMEZONE)).toEqual({
      ok: true,
      value: {
        name: 'Americano de octubre',
        startsAt: '2026-10-01T21:00:00.000Z',
        courtIds: [C1, C2],
        maxPlayers: 8,
        pointsPerGame: 24,
        roundMinutes: 20,
        rounds: 7,
        categoryMin: 4,
        categoryMax: 6,
        type: 'mixed',
        price: 400,
      },
    })
  })

  it('explains each mistake in Spanish', () => {
    expect(messageOf({ name: '' })).toBe('Poné un nombre de hasta 60 letras.')
    expect(messageOf({ date: '2026-02-30' })).toBe('Elegí el día y la hora.')
    expect(messageOf({ courtIds: [] })).toBe('Elegí las canchas.')
    expect(messageOf({ courtIds: [C1, C1] })).toBe('Elegí las canchas.')
    expect(messageOf({ courtIds: [C1, 'cancha-2'] })).toBe('Elegí las canchas.')
    expect(messageOf({ maxPlayers: '10' })).toBe('El cupo es de 8, 12 o 16 jugadores.')
    expect(messageOf({ courtIds: [C1, C2, C3] })).toBe('Con 8 jugadores se usan hasta 2 canchas.')
    expect(messageOf({ pointsPerGame: '0' })).toBe('Los puntos por partido van de 1 a 99.')
    expect(messageOf({ roundMinutes: '120' })).toBe('Los minutos por ronda van de 5 a 90.')
    expect(messageOf({ rounds: '8' })).toBe('Con 8 jugadores se juegan de 1 a 7 rondas.')
    expect(messageOf({ categoryMin: '6', categoryMax: '4' })).toBe('La categoría "desde" tiene que ser menor o igual que "hasta".')
    expect(messageOf({ type: 'kids' })).toBe('Elegí el género.')
    expect(messageOf({ price: 'mil' })).toBe('Ingresá el precio en pesos, sin puntos.')
  })
})

describe('tournamentPeriod and the checks around it', () => {
  const shape = { players: 8, courts: 2, rounds: 7, roundMinutes: 20 }
  const schedule = { timezone: TIMEZONE, opensAt: '08:00:00', closesAt: '23:00:00' }

  it('ends after all its rounds and waves', () => {
    expect(tournamentPeriod(at('18:00'), shape)).toEqual({ startsAt: at('18:00'), endsAt: at('20:20') })
  })

  it('has to fit in the club hours', () => {
    expect(fitsOpeningHours(tournamentPeriod(at('18:00'), shape), schedule)).toBe(true)
    expect(fitsOpeningHours(tournamentPeriod(at('21:30'), shape), schedule)).toBe(false)
    expect(fitsOpeningHours(tournamentPeriod(at('07:00'), shape), schedule)).toBe(false)
  })

  it('finds which chosen courts are already taken at that time', () => {
    const taken = [
      { courtId: C1, startsAt: at('19:00'), endsAt: at('20:30') },
      { courtId: C2, startsAt: at('20:20'), endsAt: at('21:50') },
      { courtId: C3, startsAt: at('18:00'), endsAt: at('19:30') },
    ]
    expect(busyCourtIds(taken, [C1, C2], tournamentPeriod(at('18:00'), shape))).toEqual([C1])
  })
})
