import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { courtsText, spotsLabel, TOURNAMENT_STATUS_LABELS } from '@/lib/domain/tournaments'

export const metadata: Metadata = { title: 'Torneos' }

export default async function ClubTournamentsPage() {
  const viewer = await requireStaff('/club/torneos')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const tournaments = await loadTournaments(club, { endsAfter: new Date(now.getTime() - 30 * 86_400_000) })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Torneos</h2>
        <Link href="/club/torneos/nuevo" className={buttonClasses()}>
          Nuevo americano
        </Link>
      </div>
      {tournaments.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {tournaments.map((tournament) => (
            <li key={tournament.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{tournament.name}</p>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                    {spotsLabel(tournament)}
                  </span>
                </div>
                <p className="text-sm text-fg-muted">
                  {dayLabel(localDateOf(tournament.startsAt, club.timezone), today)} {timeIn(tournament.startsAt, club.timezone)} a{' '}
                  {timeIn(tournament.endsAt, club.timezone)}, {courtsText(tournament.courtNames)}
                </p>
                <p className="text-sm">{TOURNAMENT_STATUS_LABELS[tournament.status]}</p>
                <Link href={`/club/torneos/${tournament.id}`} className={buttonClasses({ variant: 'secondary', className: 'mt-auto' })}>
                  Gestionar
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
          Todavía no hay torneos. Armá el primero con &quot;Nuevo americano&quot;.
        </p>
      )}
    </>
  )
}
