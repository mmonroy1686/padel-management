import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CourtList } from '@/components/club/court-card'
import { HomeDay } from '@/components/club/home-day'
import { PendingList } from '@/components/club/pending-list'
import { TransfersCard } from '@/components/club/transfers-card'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { requireStaff } from '@/lib/auth/viewer'
import { loadClubHome } from '@/lib/data/club-home'
import { loadMemberOptions } from '@/lib/data/members'
import { homeSections } from '@/lib/domain/club-home'
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

// Reception's and the admin's first screen: transfers to review, the courts in play (and the ones that just ended
// and still owe), what comes next, what is still owed today and the day. It renders again when an occupancy changes
// (Realtime) and every minute, so bookings move from Próximos to En cancha and to Pendientes on their own.
export default async function ClubHomePage() {
  const viewer = await requireStaff('/club/inicio')
  const { club } = viewer
  const now = new Date()
  const [home, members] = await Promise.all([loadClubHome(club, viewer.userId, now), loadMemberOptions(club.id)])
  const { playing, recent, upcoming, pending, next } = homeSections(home.items, now)
  const inPlay = [...playing, ...recent]
  const list = {
    timezone: club.timezone,
    methods: { cash: club.accepts_cash, transfer: club.accepts_transfer },
    members,
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
    now,
  }

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <AutoRefresh seconds={60} />

      {home.transfers ? <TransfersCard summary={home.transfers} /> : null}

      <HomeSection id="en-cancha" title="En cancha ahora">
        {inPlay.length > 0 ? (
          <CourtList items={inPlay} {...list} />
        ) : (
          <p className="text-fg-muted">
            No hay canchas en juego ahora.
            {next ? ` Próximo turno: ${next.courtName} a las ${timeIn(next.startsAt, club.timezone)}.` : ''}
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
          <PendingList turns={pending} {...list} />
        ) : (
          <p className="text-fg-muted">Lo jugado hoy está cobrado.</p>
        )}
      </HomeSection>

      <HomeSection id="el-dia" title="El día">
        <HomeDay
          occupancy={home.occupancy}
          alerts={home.alerts}
          cancellations={home.cancellations}
          timezone={club.timezone}
        />
      </HomeSection>
    </>
  )
}
