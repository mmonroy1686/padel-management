import { isDone, knockoutLabel, type Fixture, type FixtureMatch } from './championship-fixture'
import type { PairRow } from './championship-pairs'
import type { MatchView, ZoneView } from './championship-views'
import {
  ENTRY_STATUS_LABELS,
  entryStateText,
  openCategories,
  pairName,
  type Championship,
  type ChampionshipCategory,
  type ChampionshipEntry,
} from './championships'
import { normalizeText } from './members'
import type { PaymentState } from './payments'

// Design: "Buscador de jugador": the pairs whose names have every word typed (no accents, any case), each with its
// category; and the card of a pair: where it stands, its matches, its group and its way through the bracket. Made
// from what the page already loaded. The club's card also has the payment, the hours and the phones; the public
// one never does (it is built without the club's rows).

export type CardPrivate = { phones: string; paymentState: PaymentState; charge: number | null; hoursText: string }
export type CardBracket = { match: string; rival: string; next: string | null }
export type PairCard = {
  entryId: string
  categoryId: string
  categoryName: string
  pair: string
  // "Ana Pérez y Pedro Viera · 6ta Libre".
  label: string
  // "Con lugar", "En espera, puesto 2", "En la Zona A", "En la llave · Semifinal 1", "Eliminada", "Campeona".
  situation: string
  live: MatchView[]
  upcoming: MatchView[]
  played: MatchView[]
  zone: ZoneView | null
  bracket: CardBracket | null
  private: CardPrivate | null
}
export type CardInput = {
  championship: Pick<Championship, 'categories'>
  fixture: Fixture
  views: MatchView[]
  zones: ZoneView[]
}

const RESULTS = 8

export function searchPairs<T extends Pick<PairCard, 'pair'>>(pairs: T[], query: string, limit = RESULTS): T[] {
  const words = normalizeText(query)
    .split(' ')
    .filter((word) => word !== '')
  if (words.length === 0) return []
  return pairs
    .filter((item) => {
      const name = normalizeText(item.pair)
      return words.every((word) => name.includes(word))
    })
    .slice(0, limit)
}

function plays(match: Pick<FixtureMatch, 'entryA' | 'entryB'>, entryId: string): boolean {
  return match.entryA === entryId || match.entryB === entryId
}

// The side of `match` that waits for the winner of `feederId`.
function fedSide(match: FixtureMatch, feederId: string): 'a' | 'b' | null {
  if (match.sourceA?.kind === 'winner' && match.sourceA.matchId === feederId) return 'a'
  if (match.sourceB?.kind === 'winner' && match.sourceB.matchId === feederId) return 'b'
  return null
}

function situation(category: ChampionshipCategory, entry: ChampionshipEntry, fixture: Fixture): string {
  if (entry.status === 'waiting') return entryStateText(category, entry)
  const knockout = fixture.matches.filter((match) => match.categoryId === category.id && match.stage === 'knockout')
  const own = knockout.filter((match) => plays(match, entry.id))
  if (own.some((match) => isDone(match) && match.winner !== entry.id)) return 'Eliminada'
  const final = knockout.find((match) => match.round === 1)
  if (final && isDone(final) && final.winner === entry.id) return 'Campeona'
  const next = own.find((match) => !isDone(match))
  if (next) return `En la llave · ${knockoutLabel(next.round ?? 1, next.position ?? 1)}`
  const group = fixture.groups.find(
    (item) => item.categoryId === category.id && item.members.some((member) => member.entryId === entry.id),
  )
  if (!group) return ENTRY_STATUS_LABELS.active
  const place = group.members.find((member) => member.entryId === entry.id)?.place ?? null
  if (place === null) return `En la ${group.name}`
  if (knockout.length === 0) return place === 1 ? 'Campeona' : `Terminó ${place}° en la ${group.name}`
  return place > category.qualifiers ? 'Eliminada' : `Clasificada a la llave (${place}° de la ${group.name})`
}

// Where a pair is in the bracket: its match still to play, its rival and, if it wins, the next one.
function bracketOf(fixture: Fixture, views: MatchView[], entryId: string): CardBracket | null {
  const current = fixture.matches.find((match) => match.stage === 'knockout' && !isDone(match) && plays(match, entryId))
  const view = current ? views.find((item) => item.id === current.id) : undefined
  if (!current || !view) return null
  const following = fixture.matches.find((match) => fedSide(match, current.id) !== null)
  const followingView = following ? views.find((item) => item.id === following.id) : undefined
  const next =
    following && followingView
      ? `Si gana: ${followingView.name} contra ${fedSide(following, current.id) === 'a' ? followingView.sideB : followingView.sideA}`
      : null
  return { match: view.name, rival: current.entryA === entryId ? view.sideB : view.sideA, next }
}

// One card per pair with a place or waiting, in each open category. rows: the club's pairs table
// (pairsCategories); without it the cards have no private data.
export function pairCards(input: CardInput, rows?: PairRow[]): PairCard[] {
  const clubRows = new Map((rows ?? []).map((row) => [row.entryId, row]))
  return openCategories(input.championship).flatMap((category) =>
    category.entries
      .filter((entry) => entry.status === 'active' || entry.status === 'waiting')
      .map((entry): PairCard => {
        const pair = pairName(entry)
        const own = input.views.filter((view) => plays(view, entry.id))
        const row = clubRows.get(entry.id)
        return {
          entryId: entry.id,
          categoryId: category.id,
          categoryName: category.name,
          pair,
          label: `${pair} · ${category.name}`,
          situation: situation(category, entry, input.fixture),
          live: own.filter((view) => view.status === 'playing'),
          upcoming: own.filter((view) => view.status === 'scheduled'),
          played: own.filter((view) => isDone(view)),
          zone: input.zones.find((zone) => zone.rows.some((item) => item.entryId === entry.id)) ?? null,
          bracket: bracketOf(input.fixture, input.views, entry.id),
          private: row
            ? {
                phones: row.phones,
                paymentState: row.paymentState,
                charge: row.status === 'active' && row.paymentState === 'pending' && row.due > 0 ? row.due : null,
                hoursText: row.hoursText,
              }
            : null,
        }
      }),
  )
}
