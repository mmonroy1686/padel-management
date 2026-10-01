import type { Metadata } from 'next'
import Link from 'next/link'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { MatchCard } from '@/components/matches/match-card'
import { requirePlayer } from '@/lib/auth/viewer'
import { cn } from '@/lib/cn'
import { loadFreeCourts, loadMatches, loadMatchFormOptions, loadPlayerContext } from '@/lib/data/matches'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, type Match } from '@/lib/domain/matches'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { createMatch } from './actions'
import { CreateMatchButton } from './create-match-button'

export const metadata: Metadata = { title: 'Partidos' }

type SearchParams = Promise<{ ver?: string }>

const filterClasses = (current: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold',
    current ? 'border-accent bg-accent text-on-accent' : 'border-border text-fg',
  )

export default async function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/partidos')
  const { club } = viewer
  const { ver } = await searchParams
  const showAll = ver === 'todos'
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const until = zonedTime(addDays(today, club.booking_window_days + 1), 0, club.timezone)

  const [matches, context] = await Promise.all([
    loadMatches(club, { from: now, to: until }, ['forming']),
    loadPlayerContext(viewer, now),
  ])
  const [freeCourts, formOptions] = await Promise.all([
    loadFreeCourts(club, matches),
    loadMatchFormOptions(viewer, context, today),
  ])
  const joinContext = { now, closeHours: club.match_close_hours, busy: context.busy }
  const cards = matches.map((match) => ({ match, status: joinStatus(match, context.player, joinContext) }))
  const shown = showAll ? cards : cards.filter(({ match, status }) => status.ok || isInMatch(match, viewer.userId))
  const whenText = (match: Match) =>
    `${dayLabel(localDateOf(match.startsAt, club.timezone), today)} ${timeIn(match.startsAt, club.timezone)}`

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">Partidos abiertos</h1>
          <p className="text-fg-muted">Sumate a un partido al que le falta gente.</p>
        </div>
        <CreateMatchButton options={formOptions} action={createMatch} />
      </div>
      <nav aria-label="Filtro" className="flex gap-2">
        <Link href="/partidos" aria-current={showAll ? undefined : 'page'} className={filterClasses(!showAll)}>
          Donde puedo sumarme
        </Link>
        <Link href="/partidos?ver=todos" aria-current={showAll ? 'page' : undefined} className={filterClasses(showAll)}>
          Todos
        </Link>
      </nav>
      {shown.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map(({ match, status }) => (
            <li key={match.id}>
              <MatchCard
                match={match}
                viewerId={viewer.userId}
                whenText={whenText(match)}
                status={status}
                risk={riskOf(match, freeCourts.get(match.id) ?? [])}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          No hay partidos armándose para tu categoría y lado. Armá uno y compartilo en el grupo del club.
        </p>
      )}
    </>
  )
}
