import { describe, expect, it } from 'vitest'
import { championshipPreview, clubPreview, matchPreview, readMatchPreview } from '@/lib/domain/share-preview'
import { makeChampionship, TIMEZONE } from '../../fixtures/championships'

// Thursday 2026-10-15, 23:00 UTC = 20:00 in Montevideo.
const STARTS_AT = '2026-10-15T23:00:00+00:00'

describe('readMatchPreview', () => {
  it('reads what match_preview returns', () => {
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: ['backhand'] })).toEqual({
      startsAt: new Date(STARTS_AT),
      openSides: ['backhand'],
    })
  })

  it('gives null for no match, a bad date, or nothing missing', () => {
    expect(readMatchPreview(null)).toBeNull()
    expect(readMatchPreview({ starts_at: 'mañana', open_sides: ['drive'] })).toBeNull()
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: [] })).toBeNull()
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: ['both'] })).toBeNull()
  })
})

describe('matchPreview', () => {
  it('says what is missing, the day and the time, without names', () => {
    expect(matchPreview({ startsAt: new Date(STARTS_AT), openSides: ['backhand'] }, 'Rustic Pádel', TIMEZONE)).toEqual({
      title: 'Falta 1 de revés · jue 20:00',
      description: 'Sumate al partido en Rustic Pádel.',
    })
  })

  it('counts each side when more are missing', () => {
    const preview = matchPreview({ startsAt: new Date(STARTS_AT), openSides: ['backhand', 'drive', 'backhand'] }, 'Rustic Pádel', TIMEZONE)
    expect(preview.title).toBe('Faltan 3: 1 de drive y 2 de revés · jue 20:00')
  })
})

describe('championshipPreview', () => {
  it('shows the name and the dates', () => {
    expect(championshipPreview(makeChampionship())).toEqual({
      title: 'Campeonato de Primavera',
      description: 'Del sábado 17 de octubre al domingo 18 de octubre',
    })
  })
})

describe('clubPreview', () => {
  it('shows the club for any other link', () => {
    expect(clubPreview('Rustic Pádel')).toEqual({ title: 'Rustic Pádel', description: 'Reservá cancha y armá partido.' })
  })
})
