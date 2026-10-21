import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CourtList } from '@/components/club/court-card'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { requireStaff } from '@/lib/auth/viewer'
import { loadClubHome } from '@/lib/data/club-home'
import { loadMemberOptions } from '@/lib/data/members'
import { homeSections, transfersLine } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'

export const metadata: Metadata = { title: 'Inicio' }

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-bold uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Reception's and the admin's first screen: what is played now, what comes next, what is still owed today and what
// else happens. It renders again when an occupancy changes (Realtime) and every minute, so bookings move from
// Próximos to En cancha and to Pendientes on their own.
export default async function ClubHomePage() {
  const viewer = await requireStaff('/club/inicio')
  const { club } = viewer
  const now = new Date()
  const [home, members] = await Promise.all([loadClubHome(club, now), loadMemberOptions(club.id)])
  const { playing, upcoming, pending, next } = homeSections(home.items, now)
  const transfers = transfersLine(home.transfers)
  const list = {
    timezone: club.timezone,
    methods: { cash: club.accepts_cash, transfer: club.accepts_transfer },
    members,
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
  }

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <AutoRefresh seconds={60} />

      <HomeSection id="en-cancha" title="En cancha ahora">
        {playing.length > 0 ? (
          <CourtList items={playing} now={now} {...list} />
        ) : (
          <p className="text-fg-muted">
            No hay canchas en juego ahora.
            {next ? ` El próximo turno: ${next.courtName} a las ${timeIn(next.startsAt, club.timezone)}.` : ''}
          </p>
        )}
      </HomeSection>

      <HomeSection id="proximos" title="Próximos">
        {upcoming.length > 0 ? (
          <CourtList items={upcoming} {...list} />
        ) : (
          <p className="text-fg-muted">No empieza nada en la próxima hora y media.</p>
        )}
      </HomeSection>

      <HomeSection id="pendientes" title="Pendientes de cobro">
        {pending.length > 0 ? (
          <CourtList items={pending} {...list} />
        ) : (
          <p className="text-fg-muted">Lo jugado hoy está cobrado.</p>
        )}
        {transfers ? (
          <Link href="/club/cobros#transferencias" className="font-semibold text-accent-ink underline">
            {transfers}
          </Link>
        ) : null}
      </HomeSection>

      {home.today.length > 0 ? (
        <HomeSection id="hoy" title="Lo que pasa hoy">
          <ul className="flex flex-col gap-2">
            {home.today.map((line) => (
              <li key={line.text}>
                <Link href={line.href} className="font-semibold text-accent-ink underline">
                  {line.text}
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}
    </>
  )
}
