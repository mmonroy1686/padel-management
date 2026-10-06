import type { Metadata } from 'next'
import Link from 'next/link'
import { EventsTable } from '@/components/club/events-table'
import { buttonClasses } from '@/components/ui/button'
import { requireStaff } from '@/lib/auth/viewer'
import { loadChampionships } from '@/lib/data/championships'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { CHAMPIONSHIP_STATUS_LABELS, championshipPeopleText, datesText } from '@/lib/domain/championships'
import { localDateOf } from '@/lib/domain/time'
import { courtsText, TOURNAMENT_STATUS_LABELS } from '@/lib/domain/tournaments'

export const metadata: Metadata = { title: 'Torneos' }

export default async function ClubTournamentsPage() {
  const viewer = await requireStaff('/club/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const [tournaments, championships] = await Promise.all([
    loadTournaments(club, { endsAfter: new Date(now.getTime() - 30 * 86_400_000) }),
    loadChampionships(club),
  ])
  // A cancelled championship stays listed until its date passes: reception still finds who to give money back.
  const shown = championships.filter(
    (championship) => championship.status !== 'cancelled' || (championship.startsAt !== null && championship.startsAt > now),
  )

  return (
    <>
      <section aria-labelledby="campeonatos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campeonatos" className="font-display text-2xl font-bold uppercase">
            Campeonatos
          </h2>
          <Link href="/club/torneos/campeonatos/nuevo" className={buttonClasses()}>
            Nuevo campeonato
          </Link>
        </div>
        <EventsTable
          caption="Campeonatos"
          peopleLabel="Parejas"
          rows={shown.map((championship) => ({
            id: championship.id,
            name: championship.name,
            when: datesText(championship),
            at: championship.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
            status: championship.status,
            statusLabel: CHAMPIONSHIP_STATUS_LABELS[championship.status],
            people: championshipPeopleText(championship),
            href: `/club/torneos/campeonatos/${championship.id}`,
          }))}
          emptyText='Todavía no hay campeonatos. Armá el primero con "Nuevo campeonato".'
        />
      </section>

      <section aria-labelledby="americanos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="americanos" className="font-display text-2xl font-bold uppercase">
            Americanos
          </h2>
          <Link href="/club/torneos/nuevo" className={buttonClasses({ variant: 'secondary' })}>
            Nuevo americano
          </Link>
        </div>
        <EventsTable
          caption="Americanos"
          peopleLabel="Anotados"
          rows={tournaments.map((tournament) => ({
            id: tournament.id,
            name: tournament.name,
            when: `${dayLabel(localDateOf(tournament.startsAt, club.timezone), today)} ${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}, ${courtsText(tournament.courtNames)}`,
            at: tournament.startsAt.getTime(),
            status: tournament.status,
            statusLabel: TOURNAMENT_STATUS_LABELS[tournament.status],
            people: `${tournament.entries.length} de ${tournament.maxPlayers} jugadores`,
            href: `/club/torneos/${tournament.id}`,
          }))}
          emptyText='Todavía no hay americanos. Armá el primero con "Nuevo americano".'
        />
      </section>
    </>
  )
}
