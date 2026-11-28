import { describe, expect, it } from 'vitest'
import { defaultTeamA, hasFourPlayers, historyStats, parseResultForm, resultView, type ResultPlayer } from '@/lib/domain/booking-result'

const UUID = '11111111-1111-4111-8111-111111111111'
const players: ResultPlayer[] = [
  { position: 1, name: 'Ana', team: null, isMe: true },
  { position: 2, name: 'Bruno', team: null, isMe: false },
  { position: 3, name: 'Pedro', team: null, isMe: false },
  { position: 4, name: 'Juan', team: null, isMe: false },
]

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe('resultView', () => {
  it('from the viewer’s side, whichever pair she was in', () => {
    const view = resultView(players, { teamA: [2, 3], gamesA: [6, 3, 7], gamesB: [4, 6, 5] })
    expect(view).toMatchObject({ won: false, sets: '4-6 6-3 5-7', partners: ['Juan'], rivals: ['Bruno', 'Pedro'], mine: true })
  })

  it('for staff: the winners and their sets', () => {
    const others = players.map((player) => ({ ...player, isMe: false }))
    expect(resultView(others, { teamA: [1, 2], gamesA: [2, 3], gamesB: [6, 6] })).toMatchObject({
      winners: 'Pedro y Juan',
      winnerSets: '6-2 6-3',
    })
  })
})

describe('the form', () => {
  it('builds the pair and the played sets', () => {
    expect(
      parseResultForm(form({ bookingId: UUID, anchor: '3', partner: '1', a1: '6', b1: '4', a2: '7', b2: '5', a3: '', b3: '' })),
    ).toEqual({ ok: true, value: { bookingId: UUID, teamA: [1, 3], gamesA: [6, 7], gamesB: [4, 5] } })
  })

  it('refuses a set without a winner, a tie in sets, no sets and a lone pair', () => {
    expect(parseResultForm(form({ bookingId: UUID, anchor: '1', partner: '2', a1: '6', b1: '6' })).ok).toBe(false)
    expect(parseResultForm(form({ bookingId: UUID, anchor: '1', partner: '2', a1: '6', b1: '4', a2: '4', b2: '6' })).ok).toBe(false)
    expect(parseResultForm(form({ bookingId: UUID, anchor: '1', partner: '2' })).ok).toBe(false)
    expect(parseResultForm(form({ bookingId: UUID, anchor: '1', partner: '1', a1: '6', b1: '4' })).ok).toBe(false)
  })
})

describe('helpers', () => {
  it('an open match starts from its pairs', () => {
    expect(defaultTeamA(players.map((player) => ({ ...player, team: player.position % 2 ? ('a' as const) : ('b' as const) })))).toEqual([1, 3])
    expect(defaultTeamA(players)).toEqual([1, 2])
  })

  it('needs the 4, and counts the wins', () => {
    expect(hasFourPlayers(players.slice(0, 3))).toBe(false)
    const played = [
      { bookingId: 'b1', startsAt: new Date(), courtName: 'C1', players, result: { teamA: [1, 2], gamesA: [6], gamesB: [3] } },
      { bookingId: 'b2', startsAt: new Date(), courtName: 'C1', players, result: null },
    ]
    expect(historyStats(played)).toEqual({ played: 2, withResult: 1, won: 1, lost: 0 })
  })
})
