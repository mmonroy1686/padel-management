import { describe, expect, it } from 'vitest'
import { drawCategory, type CategoryDraw, type DrawEntry, type DrawSource } from '@/lib/domain/championship-draw'
import type { MatchSource } from '@/lib/domain/championship-fixture'
import {
  applySchedule,
  checkSchedule,
  scheduleChampionship,
  scheduleInput,
  schedulePayload,
  slotOptions,
  unplacedReasons,
  type ScheduledSlot,
  type ScheduleEntry,
  type ScheduleInput,
  type ScheduleMatch,
} from '@/lib/domain/championship-schedule'
import type { CategoryFormat, ChampionshipWindow } from '@/lib/domain/championships'
import { localDateOf, minutesOfDay, zonedTime } from '@/lib/domain/time'
import { makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'
import { makeMatch } from '../../fixtures/championship-fixture'

const TIMEZONE = 'America/Montevideo'
const DAY = '2026-10-17'

function window(date: string, fromTime: string, toTime: string, courtIds: string[]): ChampionshipWindow {
  return { id: `w-${date}`, date, fromTime, toTime, courtIds }
}

function pair(id: string, playerIds: string[], unavailable: string[] = []): ScheduleEntry {
  return { id, name: `Pareja ${id}`, playerIds, unavailable }
}

// A category drawn with seed 1: its pairs in this order are already strongest first.
function drawn(categoryId: string, format: CategoryFormat, entryIds: string[]): CategoryDraw {
  const entries: DrawEntry[] = entryIds.map((id, index) => ({
    id,
    level1: 5,
    level2: 5,
    seed: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
  }))
  const result = drawCategory({ id: categoryId, name: categoryId, format, groupSize: 4, qualifiers: 2, entries }, 1)
  if (!result.ok) throw new Error(result.message)
  return result.draw
}

// The matches of a draw as the scheduler takes them: ids '<category>:<key>', groups '<category>:<group>'.
function scheduleMatches(draw: CategoryDraw, minutes: number): ScheduleMatch[] {
  const id = (key: string) => `${draw.categoryId}:${key}`
  const source = (value: DrawSource | null): MatchSource | null => {
    if (value === null) return null
    return 'winnerOf' in value
      ? { kind: 'winner', matchId: id(value.winnerOf) }
      : { kind: 'group', groupId: id(value.group), place: value.place }
  }
  return draw.matches.map((match) => ({
    id: id(match.key),
    categoryId: draw.categoryId,
    minutes,
    stage: match.stage,
    groupId: match.groupKey ? id(match.groupKey) : null,
    round: match.round,
    position: match.position,
    entryA: match.entryA,
    entryB: match.entryB,
    sourceA: source(match.sourceA),
    sourceB: source(match.sourceB),
    pinned: false,
    courtId: null,
    startsAt: null,
  }))
}

// Four pairs in one group and a final, on Saturday from 08:00 to 20:00 on two courts.
function smallInput(): ScheduleInput {
  return {
    timezone: TIMEZONE,
    windows: [window(DAY, '08:00', '20:00', ['court-1', 'court-2'])],
    entries: ['e1', 'e2', 'e3', 'e4'].map((id, index) => pair(id, [`p${index}a`, `p${index}b`])),
    matches: scheduleMatches(drawn('k1', 'groups_knockout', ['e1', 'e2', 'e3', 'e4']), 90),
  }
}

function slotOf(slots: ScheduledSlot[], matchId: string): ScheduledSlot {
  const slot = slots.find((item) => item.matchId === matchId)
  if (!slot) throw new Error(`${matchId} has no slot`)
  return slot
}

function expectOneMatchPerCourt(slots: ScheduledSlot[]): void {
  const byCourt = new Map<string, ScheduledSlot[]>()
  for (const slot of slots) byCourt.set(slot.courtId, [...(byCourt.get(slot.courtId) ?? []), slot])
  for (const list of byCourt.values()) {
    const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index].startsAt.getTime()).toBeGreaterThanOrEqual(sorted[index - 1].endsAt.getTime())
    }
  }
}

describe('scheduleChampionship', () => {
  it('places every match keeping the rules, the final at the end of the last day', () => {
    const input = smallInput()
    const result = scheduleChampionship(input)
    expect(result.unplaced).toEqual([])
    expect(result.slots).toHaveLength(7)
    expect(checkSchedule(applySchedule(input, result))).toEqual([])
    expectOneMatchPerCourt(result.slots)
    const final = slotOf(result.slots, 'k1:K1-1')
    expect(localDateOf(final.startsAt, TIMEZONE)).toBe(DAY)
    expect(minutesOfDay(final.startsAt, TIMEZONE)).toBe(18 * 60 + 30)
    const lastGroupEnd = Math.max(
      ...result.slots.filter((slot) => slot.matchId !== 'k1:K1-1').map((slot) => slot.endsAt.getTime()),
    )
    expect(final.startsAt.getTime()).toBeGreaterThanOrEqual(lastGroupEnd + 45 * 60_000)
  })

  it('never puts a player of two categories in two places at once, and rests every pair 45 minutes', () => {
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '23:00', ['court-1', 'court-2'])],
      entries: [
        pair('e1', ['ana', 'pedro']),
        pair('e2', ['bruno', 'lucia']),
        pair('e3', ['gabi', 'marta']),
        pair('e4', ['ana', 'raul']),
        pair('e5', ['ivan', 'olga']),
        pair('e6', ['juli', 'nico']),
      ],
      matches: [
        ...scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2', 'e3']), 90),
        ...scheduleMatches(drawn('k2', 'round_robin', ['e4', 'e5', 'e6']), 90),
      ],
    }
    const result = scheduleChampionship(input)
    expect(result.unplaced).toEqual([])
    const playing = (entryIds: string[]) =>
      result.slots
        .filter((slot) => {
          const match = input.matches.find((item) => item.id === slot.matchId)
          return entryIds.some((entryId) => entryId === match?.entryA || entryId === match?.entryB)
        })
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    const ana = playing(['e1', 'e4'])
    expect(ana).toHaveLength(4)
    for (let index = 1; index < ana.length; index++) {
      expect(ana[index].startsAt.getTime()).toBeGreaterThanOrEqual(ana[index - 1].endsAt.getTime())
    }
    for (const entryId of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      const own = playing([entryId])
      for (let index = 1; index < own.length; index++) {
        expect(own[index].startsAt.getTime() - own[index - 1].endsAt.getTime()).toBeGreaterThanOrEqual(45 * 60_000)
      }
    }
  })

  it('leaves a pinned match where it is', () => {
    const input = smallInput()
    const pinnedAt = zonedTime(DAY, 8 * 60, TIMEZONE)
    input.matches = input.matches.map((match) =>
      match.id === 'k1:A6' ? { ...match, pinned: true, courtId: 'court-2', startsAt: pinnedAt } : match,
    )
    const result = scheduleChampionship(input)
    expect(result.slots.some((slot) => slot.matchId === 'k1:A6')).toBe(false)
    const applied = applySchedule(input, result)
    expect(applied.matches.find((match) => match.id === 'k1:A6')).toMatchObject({ courtId: 'court-2', startsAt: pinnedAt })
    expect(checkSchedule(applied)).toEqual([])
  })

  it('lists what it could not place, with the reason', () => {
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '12:00', ['court-1'])],
      entries: [{ ...pair('e1', ['ana', 'pedro'], [`${DAY}@08:00`, `${DAY}@10:00`]), name: 'Ana y Pedro' }, pair('e2', ['bruno', 'lucia'])],
      matches: scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2']), 90),
    }
    const result = scheduleChampionship(input)
    expect(result.slots).toEqual([])
    expect(result.unplaced).toEqual([
      { matchId: 'k1:A1', reason: 'Ana y Pedro no tiene horario disponible en los días de juego.' },
    ])
    expect(unplacedReasons(applySchedule(input, result))).toEqual(result.unplaced)
  })

  it('places the spec case (8 categories of 12 pairs, 3 days, 3 courts) keeping every hard rule', () => {
    const days = ['2026-10-16', '2026-10-17', '2026-10-18']
    const courts = ['court-1', 'court-2', 'court-3']
    const entries: ScheduleEntry[] = []
    const matches: ScheduleMatch[] = []
    for (let category = 0; category < 8; category++) {
      const entryIds = Array.from({ length: 12 }, (_, index) => `k${category}-e${index}`)
      entryIds.forEach((id, index) => {
        // The first pair of each category but the first has a player of the second pair of the category before.
        const first = category > 0 && index === 0 ? `k${category - 1}-p1a` : `k${category}-p${index}a`
        entries.push(pair(id, [first, `k${category}-p${index}b`]))
      })
      matches.push(...scheduleMatches(drawn(`k${category}`, 'groups_knockout', entryIds), category % 2 === 0 ? 90 : 60))
    }
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: days.map((date) => window(date, '08:00', '23:00', courts)),
      entries,
      matches,
    }
    expect(matches).toHaveLength(184)
    const result = scheduleChampionship(input)
    expect(result.slots.length + result.unplaced.length).toBe(184)
    expect(result.unplaced.length).toBeGreaterThan(0)
    expect(result.unplaced.every((item) => item.reason.length > 0)).toBe(true)
    expect(checkSchedule(applySchedule(input, result))).toEqual([])
    expectOneMatchPerCourt(result.slots)
    for (const slot of result.slots) {
      expect(days).toContain(localDateOf(slot.startsAt, TIMEZONE))
      expect(minutesOfDay(slot.startsAt, TIMEZONE)).toBeGreaterThanOrEqual(8 * 60)
      expect(minutesOfDay(slot.endsAt, TIMEZONE)).toBeLessThanOrEqual(23 * 60)
    }
  })
})

describe('slotOptions', () => {
  it('offers the other courts and starts where the match fits', () => {
    const at = (minutes: number) => zonedTime(DAY, minutes, TIMEZONE)
    const [first] = scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2']), 90)
    const [second] = scheduleMatches(drawn('k2', 'round_robin', ['e3', 'e4']), 90)
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '11:00', ['court-1', 'court-2'])],
      entries: [pair('e1', ['ana', 'pedro']), pair('e2', ['bruno', 'lucia']), pair('e3', ['gabi', 'marta']), pair('e4', ['hugo', 'nico'])],
      matches: [
        { ...first, courtId: 'court-1', startsAt: at(8 * 60) },
        { ...second, courtId: 'court-2', startsAt: at(8 * 60) },
      ],
    }
    expect(slotOptions(input, 'k1:A1')).toEqual([
      { courtId: 'court-1', startsAt: at(9 * 60 + 30) },
      { courtId: 'court-2', startsAt: at(9 * 60 + 30) },
    ])
  })
})

describe('scheduleInput and schedulePayload', () => {
  it('builds the input from a championship and its fixture', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({
          matchMinutes: 60,
          entries: [makeEntry({ id: 'e1', unavailable: ['2026-10-17@08:00'] }), makeEntry({ id: 'e2', status: 'waiting' })],
        }),
      ],
    })
    const startsAt = new Date('2026-10-17T11:00:00Z')
    const input = scheduleInput(
      championship,
      { groups: [], matches: [makeMatch({ courtId: 'court-1', startsAt, pinned: true })] },
      TIMEZONE,
    )
    expect(input.entries).toEqual([
      { id: 'e1', name: 'Ana y Pedro', playerIds: ['pl-ana', 'pl-pedro'], unavailable: ['2026-10-17@08:00'] },
    ])
    expect(input.matches[0]).toMatchObject({ id: 'm1', minutes: 60, pinned: true, courtId: 'court-1', startsAt })
    expect(input.windows).toBe(championship.windows)
  })

  it('sends the slots as save_championship_schedule takes them', () => {
    expect(
      schedulePayload({
        slots: [
          {
            matchId: 'm1',
            courtId: 'court-1',
            startsAt: new Date('2026-10-17T11:00:00Z'),
            endsAt: new Date('2026-10-17T12:30:00Z'),
          },
        ],
        unplaced: [{ matchId: 'm2', reason: 'No quedan canchas libres en los días de juego.' }],
      }),
    ).toEqual([{ match_id: 'm1', court_id: 'court-1', starts_at: '2026-10-17T11:00:00.000Z' }])
  })
})
