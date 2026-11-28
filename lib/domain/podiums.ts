import type { Championship } from './championships'
import { myEntries } from './championships'
import type { Fixture, FixtureMatch } from './championship-fixture'
import type { Tournament } from './tournaments'
import { partnerOf } from './tournaments'
import { rankingKey, tournamentRanking } from './tournament-ranking'
import { localDateOf, type LocalDate } from './time'

// The player's showcase: the podiums they reached in the club's championships and americanos (design:
// docs/features/historial-jugador/design.md). Only their own; nobody else sees it.

export type Place = 1 | 2 | 3
export type Podium = {
  key: string
  kind: 'championship' | 'americano'
  place: Place
  title: string
  // "Categoría 5ª · con Ana Pérez"
  detail: string
  date: LocalDate
  href: string
}

export const PLACE_LABELS: Record<Place, string> = { 1: 'Campeón', 2: 'Finalista', 3: 'Tercer puesto' }
export const AMERICANO_PLACE_LABELS: Record<Place, string> = { 1: '1° puesto', 2: '2° puesto', 3: '3° puesto' }

const loserOf = (match: FixtureMatch) => (match.winner === match.entryA ? match.entryB : match.entryA)

// Places 1 to 3 of one category, by entry: the final and the semifinals of its knockout or, with no knockout, the
// places of its only group once it is closed. Nothing while it is still being played.
export function categoryPlaces(categoryId: string, fixture: Fixture): Map<string, Place> {
  const places = new Map<string, Place>()
  const knockout = fixture.matches.filter((match) => match.categoryId === categoryId && match.stage === 'knockout')
  if (knockout.length > 0) {
    const final = knockout.find((match) => match.round === 1)
    if (!final?.winner) return places
    places.set(final.winner, 1)
    const runnerUp = loserOf(final)
    if (runnerUp) places.set(runnerUp, 2)
    for (const semi of knockout.filter((match) => match.round === 2 && match.winner)) {
      const third = loserOf(semi)
      if (third && !places.has(third)) places.set(third, 3)
    }
    return places
  }
  const groups = fixture.groups.filter((group) => group.categoryId === categoryId)
  if (groups.length !== 1) return places
  for (const member of groups[0].members) {
    if (member.place !== null && member.place >= 1 && member.place <= 3) places.set(member.entryId, member.place as Place)
  }
  return places
}

export function championshipPodiums(championship: Championship, fixture: Fixture, profileId: string, timezone: string): Podium[] {
  const lastDay = championship.windows.map((window) => window.date).sort().at(-1)
  return myEntries(championship, profileId).flatMap(({ entry, category }) => {
    const place = categoryPlaces(category.id, fixture).get(entry.id)
    if (!place) return []
    const partner = entry.player1.profileId === profileId ? entry.player2 : entry.player1
    return [
      {
        key: `c-${entry.id}`,
        kind: 'championship' as const,
        place,
        title: championship.name,
        detail: `${category.name} · con ${partner.name}`,
        date: lastDay ?? localDateOf(entry.createdAt, timezone),
        href: `/campeonatos/${championship.id}`,
      },
    ]
  })
}

// A finished americano: the player's place in its final ranking (their pair's, with fixed pairs).
export function americanoPodium(tournament: Tournament, profileId: string, timezone: string): Podium | null {
  if (tournament.status !== 'finished') return null
  const entry = tournament.entries.find((item) => item.playerId === profileId)
  if (!entry) return null
  const key = rankingKey(tournament, entry.id)
  const row = tournamentRanking(tournament).find((item) => item.entryId === key)
  if (!row || row.position > 3) return null
  const partner = partnerOf(tournament, entry)
  return {
    key: `t-${tournament.id}`,
    kind: 'americano',
    place: row.position as Place,
    title: tournament.name,
    detail: partner ? `Americano · con ${partner.name}` : 'Americano',
    date: localDateOf(tournament.startsAt, timezone),
    href: `/torneos/${tournament.id}`,
  }
}

// Newest first; the count of each medal for the showcase's top line.
export function sortPodiums(podiums: Podium[]): Podium[] {
  return [...podiums].sort((a, b) => b.date.localeCompare(a.date) || a.place - b.place)
}

export function medalCounts(podiums: Podium[]): Record<Place, number> {
  return {
    1: podiums.filter((podium) => podium.place === 1).length,
    2: podiums.filter((podium) => podium.place === 2).length,
    3: podiums.filter((podium) => podium.place === 3).length,
  }
}
