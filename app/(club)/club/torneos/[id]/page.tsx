import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { EntriesManager } from '@/components/tournaments/entries-manager'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { ScoreBoard } from '@/components/tournaments/score-board'
import { TournamentControls } from '@/components/tournaments/tournament-controls'
import { BackLink } from '@/components/ui/back-link'
import { requireStaff } from '@/lib/auth/viewer'
import { loadTournament } from '@/lib/data/tournaments'
import { dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { localDateOf } from '@/lib/domain/time'
import { ranking } from '@/lib/domain/tournament-ranking'
import { courtsText, formatText, spotsLabel, TOURNAMENT_STATUS_LABELS } from '@/lib/domain/tournaments'
import {
  addGuest,
  cancelTournament,
  closeRegistration,
  finishTournament,
  recordScore,
  recordTournamentCash,
  removeEntry,
  reopenRegistration,
  startTournament,
} from '../actions'

export const metadata: Metadata = { title: 'Torneo' }

type Params = Promise<{ id: string }>

export default async function ManageTournamentPage({ params }: { params: Params }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/${id}`)
  const { club } = viewer
  const tournament = await loadTournament(club, id)
  if (!tournament) notFound()

  const when = `${dayLongLabel(localDateOf(tournament.startsAt, club.timezone))}, ${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`
  const played = tournament.status === 'in_progress' || tournament.status === 'finished'

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-bold uppercase">{tournament.name}</h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
            {TOURNAMENT_STATUS_LABELS[tournament.status]} · {spotsLabel(tournament)}
          </span>
        </div>
        <p className="text-fg-muted">
          {when}, {courtsText(tournament.courtNames)}
        </p>
        <p className="text-sm">
          {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}.{' '}
          {formatText(tournament)}. {tournament.price > 0 ? `${formatPrice(tournament.price)} por persona.` : 'Sin costo.'}
        </p>
      </header>
      <TournamentControls
        tournament={tournament}
        actions={{ close: closeRegistration, reopen: reopenRegistration, start: startTournament, finish: finishTournament, cancel: cancelTournament }}
      />
      {tournament.status === 'in_progress' ? <ScoreBoard tournament={tournament} timezone={club.timezone} action={recordScore} /> : null}
      {played ? (
        <section aria-labelledby="ranking" className="flex flex-col gap-2">
          <h2 id="ranking" className="font-display text-2xl font-bold uppercase">
            {tournament.status === 'finished' ? 'Ranking final' : 'Ranking'}
          </h2>
          <RankingTable rows={ranking(tournament.entries, tournament.games, tournament.pointsPerGame)} />
        </section>
      ) : null}
      {tournament.status === 'finished' ? <FixtureList tournament={tournament} timezone={club.timezone} /> : null}
      <EntriesManager
        tournament={tournament}
        acceptsCash={club.accepts_cash}
        actions={{ cash: recordTournamentCash, remove: removeEntry, addGuest }}
      />
    </>
  )
}
