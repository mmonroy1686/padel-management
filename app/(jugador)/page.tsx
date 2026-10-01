import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MyBookingCard } from '@/components/booking/my-booking-card'
import { MatchCard } from '@/components/matches/match-card'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadFreeCourts, loadMatches, loadPlayerContext } from '@/lib/data/matches'
import { loadMyBookings } from '@/lib/data/my-bookings'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { countFree } from '@/lib/domain/grid'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, statusLabel } from '@/lib/domain/matches'
import { matchesForMe } from '@/lib/domain/matches-for-me'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { openTournamentsText } from '@/lib/domain/tournaments'
import { DayUseHomeCard } from '@/components/day-use/day-use-home-card'
import { loadDayUseHome } from '@/lib/data/day-use'
import { cancelMyBooking, reportTransfer } from './reservas/actions'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) return <Landing />
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect('/bienvenida')

  const now = new Date()
  const member = { ...viewer, membership }
  const windowEnd = zonedTime(addDays(localDateOf(now, club.timezone), club.booking_window_days + 1), 0, club.timezone)
  const [grid, bookings, matches, context, tournaments, dayUse] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    loadMyBookings(viewer, now),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
    loadTournaments(club, { endsAfter: now }),
    loadDayUseHome(viewer, now),
  ])
  const freeToday = countFree(grid.rows)
  const forMe = matchesForMe(
    matches.filter((match) => match.status === 'forming'),
    context.player,
    { now, closeHours: club.match_close_hours, busy: context.busy, timezone: club.timezone, habits: context.habits },
  )
  const myMatches = matches.filter((match) => isInMatch(match, viewer.userId)).slice(0, 3)
  const freeCourts = await loadFreeCourts(club, forMe.map((item) => item.match))
  const openTournaments = tournaments.filter((tournament) => tournament.status === 'registration' && tournament.startsAt > now).length
  const today = localDateOf(now, club.timezone)
  const whenText = (start: Date) => `${dayLabel(localDateOf(start, club.timezone), today)} ${timeIn(start, club.timezone)}`
  const transfer = { details: club.transfer_details, receiptRequired: club.transfer_receipt_required }
  const bookingCard = (booking: (typeof bookings.upcoming)[number]) => (
    <li key={booking.id}>
      <MyBookingCard booking={booking} userId={viewer.userId} transfer={transfer} cancelAction={cancelMyBooking} reportAction={reportTransfer} />
    </li>
  )

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Hola, {firstName(profile.display_name)}</h1>
        <p className="text-fg-muted">
          {categoryLabel(membership.category, membership.category_validated)}.
          {profile.side ? ` ${SIDE_LABELS[profile.side]}.` : ''}
        </p>
      </div>
      <section aria-labelledby="tus-reservas" className="flex flex-col gap-3">
        <h2 id="tus-reservas" className="font-display text-2xl font-bold uppercase">
          Tus reservas
        </h2>
        {bookings.upcoming.length > 0 ? (
          <ul className="flex flex-col gap-3">{bookings.upcoming.map(bookingCard)}</ul>
        ) : (
          <p className="text-fg-muted">
            No tenés reservas.{' '}
            <Link href="/reservar" className="font-semibold text-accent-ink underline">
              Reservá una cancha
            </Link>
            .
          </p>
        )}
      </section>
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Tu próximo partido</h2>
        {myMatches.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myMatches.map((match) => (
              <li key={match.id}>
                <Link
                  href={`/partidos/${match.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span>
                    <span className="block font-semibold">{whenText(match.startsAt)}</span>
                    <span className="block text-sm text-fg-muted">{statusLabel(match)}</span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-accent-ink">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No estás anotado en ningún partido.</p>
        )}
      </Card>
      <Link
        href="/torneos"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface p-4 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="trophy" className="text-accent-ink" />
        {openTournamentsText(openTournaments)}
      </Link>
      {dayUse ? <DayUseHomeCard home={dayUse} /> : null}
      <section aria-labelledby="para-vos" className="flex flex-col gap-3">
        <h2 id="para-vos" className="font-display text-2xl font-bold uppercase">
          Partidos para vos
        </h2>
        {forMe.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {forMe.map(({ match, reasons }) => (
              <li key={match.id}>
                <MatchCard
                  match={match}
                  viewerId={viewer.userId}
                  whenText={whenText(match.startsAt)}
                  status={joinStatus(match, context.player, { now, closeHours: club.match_close_hours, busy: context.busy })}
                  risk={riskOf(match, freeCourts.get(match.id) ?? [])}
                  reasons={reasons}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">
            Ahora no hay partidos armándose para tu categoría y lado.{' '}
            <Link href="/partidos" className="font-semibold text-accent-ink underline">
              Armá uno
            </Link>
            .
          </p>
        )}
      </section>
      <Link href="/reservar" className={buttonClasses({ fullWidth: true })}>
        {freeToday === 0 ? 'Reservar para otro día' : freeToday === 1 ? '1 turno libre hoy' : `${freeToday} turnos libres hoy`}
      </Link>
      {bookings.past.length > 0 ? (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer font-display text-xl font-bold uppercase">Pasadas y canceladas</summary>
          <ul className="mt-3 flex flex-col gap-3">{bookings.past.map(bookingCard)}</ul>
        </details>
      ) : null}
      {isStaffRole(membership.role) ? (
        <Link href="/club/grilla" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Panel del club
        </Link>
      ) : null}
    </>
  )
}

function Landing() {
  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        <p className="mb-4 text-fg-muted">Reservá cancha, armá partido y anotate en los torneos desde el celular.</p>
        <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
          Ingresar
        </Link>
      </Card>
    </>
  )
}
