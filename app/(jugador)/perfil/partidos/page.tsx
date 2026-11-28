import type { Metadata } from 'next'
import { PlayedList } from '@/components/history/played-list'
import { clearBookingResult, saveBookingResult } from '@/lib/actions/booking-result'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayedBookings } from '@/lib/data/history'
import { historyStats } from '@/lib/domain/booking-result'

export const metadata: Metadata = { title: 'Partidos jugados' }

// The player's played bookings, with their results: any of the 4 (or the club's staff) loads or corrects one.
export default async function PlayedPage() {
  const viewer = await requirePlayer('/perfil/partidos')
  const played = await loadPlayedBookings(viewer.club, 50)
  const stats = historyStats(played)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold uppercase">Partidos jugados</h1>
        <p className="text-fg-muted">
          {stats.withResult > 0
            ? `Ganaste ${stats.won} de ${stats.withResult} con resultado.`
            : 'Anotá el resultado de tus turnos y armá tu historial.'}{' '}
          Solo lo ven los que jugaron y el club.
        </p>
      </div>
      {played.length > 0 ? (
        <PlayedList played={played} timezone={viewer.club.timezone} saveAction={saveBookingResult} clearAction={clearBookingResult} />
      ) : (
        <p className="text-fg-muted">Todavía no jugaste ningún turno en el club.</p>
      )}
    </>
  )
}
