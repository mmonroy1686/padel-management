import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadPlayerContext } from '@/lib/data/matches'
import { loadTournament } from '@/lib/data/tournaments'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { localDateOf } from '@/lib/domain/time'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { ranking } from '@/lib/domain/tournament-ranking'
import { tournamentShareText } from '@/lib/domain/tournament-share'
import { entryStatus, myEntry, tournamentLeaveStatus } from '@/lib/domain/tournaments'
import { joinTournament, leaveTournament, reportTournamentTransfer } from '../actions'
import { TournamentBoard } from './tournament-board'

export const metadata: Metadata = { title: 'Torneo' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ anotarme?: string }>

export default async function TournamentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/torneos/${id}`)
  const { club } = viewer
  const tournament = await loadTournament(club, id)
  if (!tournament) notFound()

  const now = new Date()
  const { anotarme } = await searchParams
  const context = await loadPlayerContext(viewer, now)
  const entry = myEntry(tournament, viewer.userId)
  const dayText = dayLongLabel(localDateOf(tournament.startsAt, club.timezone))
  const timeText = `${timeIn(tournament.startsAt, club.timezone)} a ${timeIn(tournament.endsAt, club.timezone)}`

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <TournamentBoard
        tournament={tournament}
        viewerId={viewer.userId}
        myEntryId={entry?.id ?? null}
        whenText={`${dayText}, ${timeText}`}
        timezone={club.timezone}
        status={entryStatus(tournament, context.player, { now, busy: context.busy })}
        leave={tournamentLeaveStatus(tournament, viewer.userId)}
        payment={entry ? entryPaymentView(tournament.price, entry.payments, club.accepts_transfer) : null}
        paymentNote={paymentMethodsNote(club)}
        transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
        shareText={tournamentShareText({ tournament, clubName: club.name, dayText, timeText, url: `${getSiteUrl()}/torneos/${tournament.id}` })}
        ranking={ranking(tournament.entries, tournament.games, tournament.pointsPerGame)}
        initialJoin={anotarme === '1'}
        joinAction={joinTournament}
        leaveAction={leaveTournament}
        reportAction={reportTournamentTransfer}
      />
    </>
  )
}
