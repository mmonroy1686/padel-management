import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { CourtList } from '@/components/club/court-card'
import { HomeDay } from '@/components/club/home-day'
import { PendingList } from '@/components/club/pending-list'
import { TransfersCard } from '@/components/club/transfers-card'
import { Card } from '@/components/ui/card'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { chargeRest, chargeShare, saveBookingPlayers } from '@/lib/actions/booking-charges'
import { requireStaff } from '@/lib/auth/viewer'
import { loadClubHome } from '@/lib/data/club-home'
import { loadSetupState } from '@/lib/data/club-setup'
import { loadMemberOptions } from '@/lib/data/members'
import { homeSections } from '@/lib/domain/club-home'
import { missingForSetup, shouldOpenSetup } from '@/lib/domain/club-setup'
import { timeIn } from '@/lib/domain/format'

export const metadata: Metadata = { title: 'Inicio' }

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

// Reception's and the admin's first screen: transfers to review, the courts in play (and the ones that just ended
// and still owe), what comes next, what is still owed today and the day. It renders again when an occupancy changes
// (Realtime) and every minute, so bookings move from Próximos to En cancha and to Pendientes on their own.
// A new club (setup not finished): its admin goes to the setup assistant the first time, and Inicio says how to come
// back to it; reception reads that the admin is setting it up.
function SetupNotice({ state, admin }: { state: { activeCourts: number; priceRules: number }; admin: boolean }) {
  const missing = missingForSetup(state)
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{admin ? 'Terminá de configurar el club' : 'El club se está configurando'}</h2>
      <p className="text-fg-muted">
        {admin
          ? missing.length > 0
            ? missing.map((item) => item.text).join(' ')
            : 'Ya tiene canchas y precios: revisá el resto de los pasos y tocá Listo.'
          : 'El admin está terminando de cargar las canchas, los precios y los cobros.'}
      </p>
      {admin ? (
        <Link href="/club/alta" className="min-h-11 content-center font-semibold underline underline-offset-4">
          Seguir configurando
        </Link>
      ) : null}
    </Card>
  )
}

type SearchParams = Promise<{ alta?: string }>

export default async function ClubHomePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/inicio')
  const { club } = viewer
  const setup = club.setup_completed_at ? null : await loadSetupState(club.id)
  const later = (await searchParams).alta === 'despues'
  if (setup && shouldOpenSetup({ role: viewer.membership.role, setupCompleted: false, activeCourts: setup.activeCourts, later })) {
    redirect(`/club/alta/${missingForSetup(setup)[0]?.step ?? 'canchas'}`)
  }
  const setupNotice = setup ? <SetupNotice state={setup} admin={viewer.membership.role === 'admin'} /> : null
  const now = new Date()
  const [home, members] = await Promise.all([loadClubHome(club, viewer.userId, now), loadMemberOptions(club.id)])
  const { playing, recent, upcoming, pending, next } = homeSections(home.items, now)
  const inPlay = [...playing, ...recent]
  const list = {
    timezone: club.timezone,
    methods: { cash: club.accepts_cash, transfer: club.accepts_transfer, card: club.accepts_card },
    members,
    actions: { chargeShare, chargeRest, savePlayers: saveBookingPlayers },
    now,
  }

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <AutoRefresh seconds={60} />

      {setupNotice}
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
