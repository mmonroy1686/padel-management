import { seedOrder } from './championship-draw'
import {
  isDone,
  matchName,
  MATCH_STATUS_LABELS,
  roundName,
  scoreText,
  sideName,
  type Fixture,
  type MatchSet,
  type MatchStage,
  type MatchStatus,
} from './championship-fixture'
import { blockingTies, decisivePlaces, groupStandings } from './championship-standings'
import { activeEntries, isEntryPlayer, pairName, type Championship, type ChampionshipCategory } from './championships'
import { dayLabel, dayLongLabel, timeIn } from './format'
import { localDateOf, type LocalDate } from './time'

// What the screens of the fixture show (design: "Pantallas"): every match with its names, day, court, state and
// score; the tournament day; the tables of the groups; the brackets; the viewer's matches.

export type ViewContext = { timezone: string; today: LocalDate; courtName: Map<string, string> }
export type MatchView = {
  id: string
  categoryId: string
  categoryName: string
  // "Zona A", "Semifinal 1".
  name: string
  stage: MatchStage
  groupId: string | null
  round: number | null
  position: number | null
  sideA: string
  sideB: string
  entryA: string | null
  entryB: string | null
  startsAt: Date | null
  date: LocalDate | null
  // "Hoy", "Mañana", "sáb 17".
  day: string | null
  time: string | null
  court: string | null
  status: MatchStatus
  statusLabel: string
  score: string | null
  winner: 'a' | 'b' | null
  sets: MatchSet[]
  pinned: boolean
  // Both pairs are known: it can start.
  ready: boolean
}
export type DayGroup = { key: string; label: string; matches: MatchView[] }
export type ZoneRow = { entryId: string; name: string; played: number; won: number; lost: number; sets: string; games: string }
export type ZoneView = {
  id: string
  categoryId: string
  categoryName: string
  name: string
  complete: boolean
  closed: boolean
  // Complete and not closed: "Cerrar zona" (a tie, or it did not close by itself).
  needsOrder: boolean
  // Pairs still level on a place that matters: "Ana y Pedro y Bruno y Lucía".
  tiedNames: string[]
  rows: ZoneRow[]
}
export type BracketRound = { round: number; name: string; matches: MatchView[] }
export type Bracket = { categoryId: string; categoryName: string; rounds: BracketRound[] }
export type MyMatchView = MatchView & { rival: string }
export type MyMatchItem = MyMatchView & { href: string; championshipName: string | null }
export type SeedPair = { id: string; name: string; levels: string; seed: number | null }

function entryNames(championship: Pick<Championship, 'categories'>): Map<string, string> {
  return new Map(championship.categories.flatMap((category) => category.entries.map((entry) => [entry.id, pairName(entry)] as const)))
}

function startOf(view: MatchView): number {
  return view.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER
}

export function matchViews(championship: Pick<Championship, 'categories'>, fixture: Fixture, ctx: ViewContext): MatchView[] {
  const names = entryNames(championship)
  const categoryName = new Map(championship.categories.map((category) => [category.id, category.name]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  const entryName = (entryId: string) => names.get(entryId) ?? 'Pareja'
  return fixture.matches
    .map((match): MatchView => {
      const date = match.startsAt ? localDateOf(match.startsAt, ctx.timezone) : null
      return {
        id: match.id,
        categoryId: match.categoryId,
        categoryName: categoryName.get(match.categoryId) ?? '',
        name: matchName(fixture, match),
        stage: match.stage,
        groupId: match.groupId,
        round: match.round,
        position: match.position,
        sideA: sideName(fixture, match, 'a', entryName),
        sideB: sideName(fixture, match, 'b', entryName),
        entryA: match.entryA,
        entryB: match.entryB,
        startsAt: match.startsAt,
        date,
        day: date ? dayLabel(date, ctx.today) : null,
        time: match.startsAt ? timeIn(match.startsAt, ctx.timezone) : null,
        court: match.courtId ? (ctx.courtName.get(match.courtId) ?? 'Cancha') : null,
        status: match.status,
        statusLabel: MATCH_STATUS_LABELS[match.status],
        score: scoreText(match),
        winner: match.winner === null ? null : match.winner === match.entryA ? 'a' : 'b',
        sets: match.sets,
        pinned: match.pinned,
        ready: match.entryA !== null && match.entryB !== null,
      }
    })
    .sort(
      (a, b) =>
        startOf(a) - startOf(b) ||
        (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
        (a.court ?? '').localeCompare(b.court ?? ''),
    )
}

// "En juego ahora", the next ones and the last ones played.
export function dayBoard(views: MatchView[], limit = 6): { playing: MatchView[]; upcoming: MatchView[]; finished: MatchView[] } {
  return {
    playing: views.filter((view) => view.status === 'playing'),
    upcoming: views.filter((view) => view.status === 'scheduled' && view.startsAt !== null).slice(0, limit),
    finished: views.filter((view) => isDone(view)).reverse().slice(0, limit),
  }
}

// The matches by day of play ("Sábado 17 de octubre"), the ones without a time last.
export function byDay(views: MatchView[]): DayGroup[] {
  const days = new Map<string, DayGroup>()
  for (const view of views) {
    const key = view.date ?? 'sin-horario'
    const label = view.date ? dayLongLabel(view.date) : 'sin horario'
    const day = days.get(key) ?? { key, label: `${label.charAt(0).toUpperCase()}${label.slice(1)}`, matches: [] }
    day.matches.push(view)
    days.set(key, day)
  }
  return [...days.values()]
}

export function zoneViews(championship: Pick<Championship, 'categories'>, fixture: Fixture): ZoneView[] {
  const names = entryNames(championship)
  const categories = new Map(championship.categories.map((category) => [category.id, category]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  return [...fixture.groups]
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sortOrder - b.sortOrder)
    .map((group): ZoneView => {
      const category = categories.get(group.categoryId)
      const standings = groupStandings(group, fixture.matches)
      const places = category ? decisivePlaces(category, group.members.length) : group.members.length
      const closed = group.members.length > 0 && group.members.every((member) => member.place !== null)
      const place = new Map(group.members.map((member) => [member.entryId, member.place ?? 0]))
      const rows = closed
        ? [...standings.rows].sort((a, b) => (place.get(a.entryId) ?? 0) - (place.get(b.entryId) ?? 0))
        : standings.rows
      return {
        id: group.id,
        categoryId: group.categoryId,
        categoryName: category?.name ?? '',
        name: group.name,
        complete: standings.complete,
        closed,
        needsOrder: standings.complete && !closed,
        tiedNames: closed
          ? []
          : blockingTies(standings, places).map((level) => level.map((entryId) => names.get(entryId) ?? 'Pareja').join(' y ')),
        rows: rows.map((row) => ({
          entryId: row.entryId,
          name: names.get(row.entryId) ?? 'Pareja',
          played: row.played,
          won: row.won,
          lost: row.lost,
          sets: `${row.setsWon}-${row.setsLost}`,
          games: `${row.gamesWon}-${row.gamesLost}`,
        })),
      }
    })
}

// Each category's bracket, first round first.
export function brackets(championship: Pick<Championship, 'categories'>, views: MatchView[]): Bracket[] {
  return championship.categories.flatMap((category): Bracket[] => {
    const knockout = views.filter((view) => view.categoryId === category.id && view.stage === 'knockout')
    if (knockout.length === 0) return []
    const rounds = [...new Set(knockout.map((view) => view.round ?? 1))].sort((a, b) => b - a)
    return [
      {
        categoryId: category.id,
        categoryName: category.name,
        rounds: rounds.map((round) => ({
          round,
          name: roundName(round),
          matches: knockout
            .filter((view) => (view.round ?? 1) === round)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        })),
      },
    ]
  })
}

// "Mis partidos": the matches of the viewer's pairs with a place, each with the rival's name.
export function myMatchViews(championship: Pick<Championship, 'categories'>, views: MatchView[], profileId: string): MyMatchView[] {
  const mine = new Set(
    championship.categories.flatMap((category) =>
      activeEntries(category)
        .filter((entry) => isEntryPlayer(entry, profileId))
        .map((entry) => entry.id),
    ),
  )
  return views.flatMap((view): MyMatchView[] => {
    if (view.entryA && mine.has(view.entryA)) return [{ ...view, rival: view.sideB }]
    if (view.entryB && mine.has(view.entryB)) return [{ ...view, rival: view.sideA }]
    return []
  })
}

// Every match played and every group closed: "Finalizar".
export function finishable(fixture: Fixture): boolean {
  return (
    fixture.matches.length > 0 &&
    fixture.matches.every(isDone) &&
    fixture.groups.every((group) => group.members.every((member) => member.place !== null))
  )
}

// Design: "Compartir".
export function championshipShareText(name: string, url: string): string {
  return `Seguí el ${name} en vivo: ${url}`
}

// "Cabezas de serie": the pairs with a place in the order the draw takes them.
export function seedPairs(category: Pick<ChampionshipCategory, 'entries'>): SeedPair[] {
  return seedOrder(activeEntries(category)).map((entry) => ({
    id: entry.id,
    name: pairName(entry),
    levels: `Declaran ${entry.level1}ª y ${entry.level2}ª (suma ${entry.level1 + entry.level2})`,
    seed: entry.seed,
  }))
}
