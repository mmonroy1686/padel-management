import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MyBookingCard } from '@/components/booking/my-booking-card'
import { MyMatches } from '@/components/championships/my-matches'
import { MatchCard } from '@/components/matches/match-card'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HeroAction } from '@/components/ui/hero-action'
import { EmptyLine, PageSection } from '@/components/ui/page-section'
import { RowLink, RowList } from '@/components/ui/row-list'
import { getClub, getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadNextFree } from '@/lib/data/next-free'
import { loadFreeCourts, loadMatches, loadPlayerContext } from '@/lib/data/matches'
import { loadMyBookings } from '@/lib/data/my-bookings'
import { loadMyChampionshipMatches } from '@/lib/data/championship-fixture'
import { loadTournaments } from '@/lib/data/tournaments'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { countFree, nextFreeCells, slotParam } from '@/lib/domain/grid'
import { freeTodayText } from '@/lib/domain/next-free'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, statusLabel } from '@/lib/domain/matches'
import { matchesForMe } from '@/lib/domain/matches-for-me'
import { firstName, incompleteHome, isProfileComplete } from '@/lib/domain/profile'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { openTournamentsText } from '@/lib/domain/tournaments'
import { ClubSection } from '@/components/club-info/club-section'
import { DayUseHomeCard } from '@/components/day-use/day-use-home-card'
import { loadClubInfo } from '@/lib/data/club-info'
import type { Club } from '@/lib/auth/viewer'
import { loadDayUseHome } from '@/lib/data/day-use'
import { cancelMyBooking, reportTransfer } from './reservas/actions'
import { HoldBanner } from '@/components/waitlist/hold-banner'
import { WaitingCard } from '@/components/waitlist/waiting-card'
import { cancelSlotWait, claimSlotHold, declineSlotHold } from '@/lib/actions/waitlist'
import { loadMyWaitlist } from '@/lib/data/waitlist'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { holdText, waitItems } from '@/lib/domain/waitlist'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) {
    const club = await getClub()
    return <Landing club={club} />
  }
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect(incompleteHome(membership))

  const now = new Date()
  const member = { ...viewer, membership }
  const windowEnd = zonedTime(addDays(localDateOf(now, club.timezone), club.booking_window_days + 1), 0, club.timezone)
  const [grid, bookings, matches, context, tournaments, dayUse, waitlist, championshipMatches, clubInfo] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    loadMyBookings(viewer, now),
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
    loadTournaments(club, { endsAfter: now }),
    loadDayUseHome(viewer, now),
    loadMyWaitlist(viewer, now),
    loadMyChampionshipMatches(club, viewer.userId, now),
    loadClubInfo(club),
  ])
  const freeToday = countFree(grid.rows)
  const quickSlots = nextFreeCells(grid.rows, 3)
  const today = localDateOf(now, club.timezone)
  // A full today points at the next day with room instead of a dead end.
  const nextFree = freeToday === 0 ? await loadNextFree(club, viewer.userId, today, addDays(today, 6), now) : null
  const forMe = matchesForMe(
    matches.filter((match) => match.status === 'forming'),
    context.player,
    { now, closeMinutes: club.match_close_minutes, busy: context.busy, timezone: club.timezone, habits: context.habits },
  )
  const myMatches = matches.filter((match) => isInMatch(match, viewer.userId)).slice(0, 3)
  const freeCourts = await loadFreeCourts(club, forMe.map((item) => item.match))
  const openTournaments = tournaments.filter((tournament) => tournament.status === 'registration' && tournament.startsAt > now).length
  const whenText = (start: Date) => `${dayLabel(localDateOf(start, club.timezone), today)} ${timeIn(start, club.timezone)}`
  const transfer = { details: club.transfer_details, receiptRequired: club.transfer_receipt_required }
  const bookingCard = (booking: (typeof bookings.upcoming)[number]) => (
    <li key={booking.id}>
      <MyBookingCard booking={booking} userId={viewer.userId} transfer={transfer} cancelAction={cancelMyBooking} reportAction={reportTransfer} />
    </li>
  )

  // Yours (bookings, waits, matches) on the left on a wide screen; what to do next on the right.
  const hasMine =
    bookings.upcoming.length > 0 || waitlist.waits.length > 0 || myMatches.length > 0 || championshipMatches.length > 0
  const mine = (
    <>
      {/* Only when there is something: with nothing booked, the button on top already says what to do. */}
      {bookings.upcoming.length > 0 || waitlist.waits.length > 0 ? (
        <PageSection id="tus-reservas" title="Tus reservas">
          {bookings.upcoming.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">{bookings.upcoming.map(bookingCard)}</ul>
          ) : null}
          <WaitingCard waits={waitItems(waitlist.waits, waitlist.courts, today)} cancelAction={cancelSlotWait} />
        </PageSection>
      ) : null}
      {myMatches.length > 0 || championshipMatches.length > 0 ? (
        <PageSection id="tus-partidos" title="Tus partidos">
          {myMatches.length > 0 ? (
            <RowList label="Partidos abiertos en los que estás">
              {myMatches.map((match) => (
                <RowLink key={match.id} href={`/partidos/${match.id}`} title={whenText(match.startsAt)} detail={statusLabel(match)} />
              ))}
            </RowList>
          ) : null}
          {championshipMatches.length > 0 ? <MyMatches matches={championshipMatches} /> : null}
        </PageSection>
      ) : null}
    </>
  )
  const forYou = (
    <PageSection id="para-vos" title="Partidos para vos" more={forMe.length > 3 ? { href: '/partidos', label: 'Ver todos' } : undefined}>
      {forMe.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
          {forMe.slice(0, 3).map(({ match, reasons }) => (
            <li key={match.id}>
              <MatchCard
                match={match}
                viewerId={viewer.userId}
                whenText={whenText(match.startsAt)}
                status={joinStatus(match, context.player, { now, closeMinutes: club.match_close_minutes, busy: context.busy })}
                risk={riskOf(match, freeCourts.get(match.id) ?? [])}
                reasons={reasons}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyLine action={{ href: '/partidos', label: 'Armá uno' }}>Ahora no hay partidos armándose para tu categoría y lado.</EmptyLine>
      )}
    </PageSection>
  )
  const extras = (
    <>
      {dayUse ? <DayUseHomeCard home={dayUse} /> : null}
      <RowList label="Torneos">
        <RowLink href="/torneos" icon="trophy" title={openTournamentsText(openTournaments)} />
      </RowList>
    </>
  )

  return (
    <>
      {waitlist.hold ? (
        <HoldBanner
          holdId={waitlist.hold.id}
          text={holdText(waitlist.hold, club.timezone, today)}
          expiresAt={waitlist.hold.expiresAt.toISOString()}
          price={waitlist.hold.price}
          paymentNote={paymentMethodsNote(club)}
          claimAction={claimSlotHold}
          declineAction={declineSlotHold}
        />
      ) : null}
      <h1 className="font-display text-4xl font-bold uppercase">Hola, {firstName(profile.display_name)}</h1>
      {/* The one thing Inicio is for, first: book a court. */}
      <HeroAction
        href={nextFree ? `/reservar?dia=${nextFree.date}` : '/reservar'}
        icon="calendar-plus"
        title="Reservar cancha"
        detail={freeTodayText(freeToday, nextFree, today)}
      />
      {/* The next free slots of today, one tap from their booking sheet. */}
      {quickSlots.length > 0 ? (
        <ul aria-label="Próximos turnos libres de hoy" className="-mt-2 flex flex-wrap gap-2">
          {quickSlots.map((cell) => (
            <li key={slotParam(cell)}>
              <Link
                href={`/reservar?dia=${today}&turno=${encodeURIComponent(slotParam(cell))}`}
                aria-label={`Reservar ${cell.courtName} a las ${cell.time}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="tabular-nums">{cell.time}</span>
                <span className="text-sm font-normal text-fg-muted">{cell.courtName}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Two columns on wide screens: what you have on the left, what to do next on the right. With nothing of yours
          yet, «Partidos para vos» takes the left one, so the screen never shows half of it blank. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-8">{hasMine ? mine : forYou}</div>
        <div className="flex flex-col gap-8">
          {hasMine ? forYou : null}
          {extras}
        </div>
      </div>
      {bookings.past.length > 0 ? (
        <details className="flex flex-col gap-3">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold">Pasadas y canceladas</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{bookings.past.map(bookingCard)}</ul>
        </details>
      ) : null}
      {clubInfo ? <ClubSection view={clubInfo} clubName={club.name} timezone={club.timezone} folded /> : null}
    </>
  )
}


async function Landing({ club }: { club: Club }) {
  const clubInfo = await loadClubInfo(club)
  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase">{club.name}</h1>
      <Card>
        <p className="mb-4 text-fg-muted">Reservá cancha, armá partido y anotate en los torneos desde el celular.</p>
        <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
          Ingresar
        </Link>
      </Card>
      {clubInfo ? <ClubSection view={clubInfo} clubName={club.name} timezone={club.timezone} /> : null}
    </>
  )
}
