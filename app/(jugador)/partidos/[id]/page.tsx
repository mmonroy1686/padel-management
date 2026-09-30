import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadFreeCourts, loadMatch, loadPlayerContext } from '@/lib/data/matches'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { canJoin, joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { shareText } from '@/lib/domain/match-share'
import { howItWorks, leaveStatus, openSlots } from '@/lib/domain/matches'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { localDateOf } from '@/lib/domain/time'
import { joinMatch, leaveMatch } from '../actions'
import { MatchBoard } from './match-board'

export const metadata: Metadata = { title: 'Partido' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ sumarme?: string }>

export default async function MatchPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/partidos/${id}`)
  const { club } = viewer
  const match = await loadMatch(club, id)
  if (!match) notFound()

  const now = new Date()
  const { sumarme } = await searchParams
  const [context, freeCourts] = await Promise.all([loadPlayerContext(viewer, now), loadFreeCourts(club, [match])])
  const joinContext = { now, closeHours: club.match_close_hours, busy: context.busy }
  const joinable = openSlots(match)
    .filter((slot) => canJoin(match, slot.position, context.player, joinContext).ok)
    .map((slot) => slot.position)
  const requested = Number(sumarme)
  const dayText = dayLongLabel(localDateOf(match.startsAt, club.timezone))
  const time = timeIn(match.startsAt, club.timezone)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <MatchBoard
        match={match}
        viewerId={viewer.userId}
        whenText={`${dayText}, ${time}`}
        status={joinStatus(match, context.player, joinContext)}
        joinable={joinable}
        initialJoin={joinable.includes(requested) ? requested : null}
        risk={riskOf(match, freeCourts.get(match.id) ?? [])}
        howItWorks={howItWorks(club.match_close_hours, club.cancellation_notice_hours)}
        paymentNote={paymentMethodsNote(club)}
        closeHours={club.match_close_hours}
        leave={leaveStatus(match, viewer.userId, club.cancellation_notice_hours, now)}
        shareText={shareText({ match, clubName: club.name, dayText, time, url: `${getSiteUrl()}/partidos/${match.id}` })}
        joinAction={joinMatch}
        leaveAction={leaveMatch}
      />
    </>
  )
}
