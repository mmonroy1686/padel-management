import type { Metadata } from 'next'
import { DayStrip } from '@/components/booking/day-strip'
import { FormingMatchesPanel } from '@/components/club/forming-matches-panel'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadFreeCourts } from '@/lib/data/matches'
import { loadMemberOptions } from '@/lib/data/members'
import { dayLabel, dayLongLabel, formatPrice, timeIn } from '@/lib/domain/format'
import { dayStats } from '@/lib/domain/grid'
import { riskOf } from '@/lib/domain/match-risk'
import { isLocalDate } from '@/lib/domain/input'
import { addDays, localDateOf } from '@/lib/domain/time'
import { cancelBooking, cancelMatch, endSeries, loadSlot, recordCash, releaseSlotHold, removeFromMatch, unblockCourt } from './actions'
import { ClubBoard } from './club-board'

export const metadata: Metadata = { title: 'Grilla' }

type SearchParams = Promise<{ dia?: string }>

export default async function GridPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/grilla')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const date = isLocalDate(dia) ? dia : today
  // The strip starts today; a date picked from the calendar outside it starts its own strip.
  const stripStart = date >= today && date <= addDays(today, 6) ? today : date
  const days = Array.from({ length: 7 }, (_, index) => addDays(stripStart, index))

  const [grid, members] = await Promise.all([loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now), loadMemberOptions(club.id)])
  const stats = dayStats(grid)
  const forming = grid.matches.filter((match) => match.status === 'forming')
  const freeCourts = await loadFreeCourts(club, forming)
  const panelItems = forming.map((match) => ({
    match,
    timeText: timeIn(match.startsAt, club.timezone),
    risk: riskOf(match, freeCourts.get(match.id) ?? []),
  }))

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/club/grilla" />
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="font-display text-3xl font-bold">{stats.occupancyPercent}%</p>
          <p className="text-sm text-fg-muted">Ocupación del día</p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold">{formatPrice(stats.revenue)}</p>
          <p className="text-sm text-fg-muted">Ingresos por canchas</p>
        </Card>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ClubBoard
          key={date}
          date={date}
          dayText={dayLongLabel(date)}
          timezone={club.timezone}
          grid={grid}
          members={members}
          acceptsCash={club.accepts_cash}
          loadAction={loadSlot}
          detailActions={{
            cancel: cancelBooking,
            unblock: unblockCourt,
            cash: recordCash,
            endSeries,
            cancelMatch,
            removeFromMatch,
            release: releaseSlotHold,
          }}
        />
        <FormingMatchesPanel items={panelItems} actions={{ cancelMatch, removeFromMatch }} />
      </div>
    </>
  )
}
