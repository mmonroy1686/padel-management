import { describe, expect, it } from 'vitest'
import {
  activation,
  byAttention,
  milestoneGroups,
  onlineShare,
  overviewText,
  parseAccountContactForm,
  parseAccountStatusForm,
  trialState,
  weekOccupancy,
  weekOnlineShare,
  type ClubWeek,
} from '@/lib/domain/platform-trial'
import { platformClub } from '../../fixtures/platform'

const UUID = '11111111-1111-4111-8111-111111111111'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe('trialState', () => {
  const club = platformClub({ trialEndsOn: '2026-12-10' })

  it('counts the days left, and warns in the last week', () => {
    expect(trialState(club, '2026-11-27')).toEqual({ text: 'Prueba · quedan 13 días', tone: 'calm', daysLeft: 13 })
    expect(trialState(club, '2026-12-03').tone).toBe('soon')
    expect(trialState(club, '2026-12-09').text).toBe('Prueba · queda 1 día')
    expect(trialState(club, '2026-12-10').text).toBe('Prueba · vence hoy')
  })

  it('says when it ended, and nothing else happens', () => {
    expect(trialState(club, '2026-12-11')).toEqual({ text: 'Prueba · venció ayer', tone: 'over', daysLeft: -1 })
    expect(trialState(club, '2026-12-14').text).toBe('Prueba · venció hace 4 días')
  })

  it('any other status is its name', () => {
    expect(trialState({ ...club, status: 'active' }, '2026-12-20')).toEqual({ text: 'Activo', tone: 'none', daysLeft: null })
    expect(trialState({ ...club, status: 'churned' }, '2026-12-20').text).toBe('Baja')
  })
})

describe('milestones', () => {
  it('keeps the order, with dates and how far the counted ones are', () => {
    const groups = milestoneGroups(platformClub())
    expect(groups.map((group) => group.title)).toEqual(['Setup', 'Primeras reservas', 'Masa crítica', 'Módulos'])
    const mass = groups[2].milestones
    expect(mass[0]).toMatchObject({ label: '20 jugadores', done: false, progress: '12 de 20' })
    expect(mass[1]).toMatchObject({ label: '30% online en 7 días', done: false, progress: '24%' })
  })

  it('the next step is the first one missing', () => {
    const club = platformClub()
    expect(activation(club)).toMatchObject({ done: 5, total: 11, next: { key: 'players' } })
    const full = platformClub({
      players: 40,
      onlineLastWeek: 20,
      milestones: {
        ...club.milestones,
        twentiethPlayer: new Date(),
        firstPayment: new Date(),
        firstMatch: new Date(),
        firstTournament: new Date(),
        firstDayUse: new Date(),
      },
    })
    expect(activation(full)).toMatchObject({ done: 11, next: null })
  })

  it('a week without bookings says so instead of 0%', () => {
    const club = platformClub({ bookingsLastWeek: 0, onlineLastWeek: 0 })
    expect(onlineShare(club)).toBeNull()
    expect(milestoneGroups(club)[2].milestones[1].progress).toBe('Sin reservas en 7 días')
  })
})

describe('the list', () => {
  const clubs = [
    platformClub({ id: 'a', name: 'Activo', status: 'active' }),
    platformClub({ id: 'b', name: 'Lejos', trialEndsOn: '2027-01-20' }),
    platformClub({ id: 'c', name: 'Vencido', trialEndsOn: '2026-11-20' }),
    platformClub({ id: 'd', name: 'Pronto', trialEndsOn: '2026-11-30' }),
  ]

  it('puts the trials first, the ones ending sooner on top', () => {
    expect(byAttention(clubs, '2026-11-27').map((club) => club.name)).toEqual(['Vencido', 'Pronto', 'Lejos', 'Activo'])
  })

  it('sums it up in one line', () => {
    expect(overviewText(clubs, '2026-11-27')).toBe('4 clubes · 3 en prueba · 1 activo · 1 vence en 7 días · 1 venció')
  })
})

describe('weeks', () => {
  const week: ClubWeek = {
    week: '2026-11-16',
    bookingsOnline: 19,
    bookingsReception: 37,
    cancelled: 0,
    cancelledLate: 0,
    openHours: 315,
    busyHours: 84,
    activePlayers: 16,
    newPlayers: 0,
    recovered: 0,
    payments: 48,
    amount: 72000,
    played: 56,
    noShows: 0,
  }

  it('shares and occupancy as rounded percents, none without a base', () => {
    expect(weekOnlineShare(week)).toBe(34)
    expect(weekOccupancy(week)).toBe(27)
    expect(weekOccupancy({ ...week, openHours: 0 })).toBeNull()
  })
})

describe('forms', () => {
  it('reads the status and the end of the trial', () => {
    expect(parseAccountStatusForm(form({ clubId: UUID, status: 'paused', trialEndsOn: '2027-02-01' }))).toEqual({
      ok: true,
      value: { clubId: UUID, status: 'paused', trialEndsOn: '2027-02-01' },
    })
    expect(parseAccountStatusForm(form({ clubId: UUID, status: 'trial', trialEndsOn: '' }))).toMatchObject({
      ok: true,
      value: { trialEndsOn: null },
    })
    expect(parseAccountStatusForm(form({ clubId: UUID, status: 'gone' })).ok).toBe(false)
    expect(parseAccountStatusForm(form({ clubId: UUID, status: 'trial', trialEndsOn: 'mañana' })).ok).toBe(false)
  })

  it('reads the contact, trimmed, with an optional email', () => {
    expect(
      parseAccountContactForm(form({ clubId: UUID, ownerName: ' Raúl ', ownerPhone: '099', ownerEmail: ' R@Club.uy ', notes: ' hola ' })),
    ).toEqual({ ok: true, value: { clubId: UUID, ownerName: 'Raúl', ownerPhone: '099', ownerEmail: 'r@club.uy', notes: 'hola' } })
    expect(parseAccountContactForm(form({ clubId: UUID, ownerEmail: '' })).ok).toBe(true)
    expect(parseAccountContactForm(form({ clubId: UUID, ownerEmail: 'no' })).ok).toBe(false)
    expect(parseAccountContactForm(form({ clubId: UUID, notes: 'x'.repeat(4001) })).ok).toBe(false)
  })
})
