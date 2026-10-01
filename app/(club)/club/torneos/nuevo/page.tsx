import type { Metadata } from 'next'
import { NewTournamentForm } from '@/components/tournaments/new-tournament-form'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadActiveCourts, loadTakenPeriods } from '@/lib/data/tournaments'
import { TIME_OPTIONS } from '@/lib/domain/settings'
import { localDateOf, parseTime } from '@/lib/domain/time'
import { createTournament } from '../actions'

export const metadata: Metadata = { title: 'Nuevo americano' }

export default async function NewTournamentPage() {
  const viewer = await requireStaff('/club/torneos/nuevo')
  const { club } = viewer
  const now = new Date()
  const [courts, taken] = await Promise.all([loadActiveCourts(club), loadTakenPeriods(club, now, 60)])
  const opens = parseTime(club.opens_at)
  const closes = parseTime(club.closes_at)
  const times = TIME_OPTIONS.filter((time) => parseTime(time) >= opens && parseTime(time) < closes)

  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <h2 className="font-display text-2xl font-bold uppercase">Nuevo americano</h2>
      <Card>
        <NewTournamentForm
          courts={courts}
          times={times}
          today={localDateOf(now, club.timezone)}
          timezone={club.timezone}
          opensAt={club.opens_at}
          closesAt={club.closes_at}
          taken={taken}
          action={createTournament}
        />
      </Card>
    </>
  )
}
