import type { Metadata } from 'next'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { TournamentCard } from '@/components/tournaments/tournament-card'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayerContext } from '@/lib/data/matches'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { entryStatus, type Tournament } from '@/lib/domain/tournaments'
import { ChampionshipCard } from '@/components/championships/championship-card'
import { loadChampionships } from '@/lib/data/championships'
import { registrationOpen, upcomingChampionships } from '@/lib/domain/championships'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import { getSupabaseEnv } from '@/lib/supabase/env'

export const metadata: Metadata = { title: 'Torneos' }

export default async function TournamentsPage() {
  const viewer = await requirePlayer('/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const [tournaments, context, championships] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 7 * 86_400_000) }),
    loadPlayerContext(viewer, now),
    loadChampionships(club),
  ])
  const upcomingChampionshipsList = upcomingChampionships(championships, now)
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
        <p className="text-fg-muted">Campeonatos por parejas y americanos del club.</p>
      </div>
      {upcomingChampionshipsList.length > 0 ? (
        <section aria-labelledby="campeonatos" className="flex flex-col gap-3">
          <h2 id="campeonatos" className="text-lg font-semibold">
            Campeonatos
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {upcomingChampionshipsList.map((championship) => {
              const open = registrationOpen(championship, now)
              return (
                <li key={championship.id}>
                  <ChampionshipCard
                    championship={championship}
                    posterUrl={championshipPosterUrl(getSupabaseEnv().url, championship.posterPath)}
                    href={`/campeonatos/${championship.id}`}
                    actionLabel={open ? 'Ver categorías y anotarme' : 'Ver campeonato'}
                    primary={open}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="americanos" className="flex flex-col gap-3">
        <h2 id="americanos" className="text-lg font-semibold">
          Americanos
        </h2>
        <p className="text-fg-muted">Te anotás solo y en cada ronda cambiás de pareja.</p>
        {upcoming.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">{upcoming.map(card)}</ul>
        ) : (
          <p className="rounded-xl border border-border p-4 text-fg-muted">
            Ahora no hay americanos. Cuando el club arme uno, aparece acá.
          </p>
        )}
      </section>
      {finished.length > 0 ? (
        <section aria-labelledby="finalizados" className="flex flex-col gap-3">
          <h2 id="finalizados" className="text-lg font-semibold">
            Finalizados
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">{finished.map(card)}</ul>
        </section>
      ) : null}
    </>
  )
}
