import type { Metadata } from 'next'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { TournamentCard } from '@/components/tournaments/tournament-card'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayerContext } from '@/lib/data/matches'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { entryStatus, type Tournament } from '@/lib/domain/tournaments'

export const metadata: Metadata = { title: 'Torneos' }

export default async function TournamentsPage() {
  const viewer = await requirePlayer('/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const [tournaments, context] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 7 * 86_400_000) }),
    loadPlayerContext(viewer, now),
  ])
  const upcoming = tournaments.filter((tournament) => tournament.status !== 'finished')
  const finished = tournaments.filter((tournament) => tournament.status === 'finished').reverse()
  const card = (tournament: Tournament) => (
    <li key={tournament.id}>
      <TournamentCard
        tournament={tournament}
        whenText={`${dayLabel(localDateOf(tournament.startsAt, club.timezone), today)} ${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`}
        status={entryStatus(tournament, context.player, { now, busy: context.busy })}
      />
    </li>
  )

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Torneos</h1>
        <p className="text-fg-muted">Americanos del club: te anotás solo y en cada ronda cambiás de pareja.</p>
      </div>
      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-3">{upcoming.map(card)}</ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          Ahora no hay torneos. Cuando el club arme uno, aparece acá.
        </p>
      )}
      {finished.length > 0 ? (
        <section aria-labelledby="finalizados" className="flex flex-col gap-3">
          <h2 id="finalizados" className="font-display text-2xl font-bold uppercase">
            Finalizados
          </h2>
          <ul className="flex flex-col gap-3">{finished.map(card)}</ul>
        </section>
      ) : null}
    </>
  )
}
