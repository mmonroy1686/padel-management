import type { Metadata } from 'next'
import { AssistantScreen } from '@/components/assistant/assistant-screen'
import { FlyerShare } from '@/components/assistant/flyer-share'
import { DayStrip } from '@/components/booking/day-strip'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { getSiteUrl } from '@/lib/auth/redirect'
import { requireStaff } from '@/lib/auth/viewer'
import { loadAssistantDay } from '@/lib/data/assistant'
import { recommendationText, recommendedSlots } from '@/lib/domain/assistant-board'
import { dayLabel } from '@/lib/domain/format'
import { flyerLayout, flyerText } from '@/lib/domain/free-slots-flyer'
import { isLocalDate } from '@/lib/domain/input'
import { addDays, localDateOf } from '@/lib/domain/time'
import { createStaffMatch, inviteToMatch } from './actions'

export const metadata: Metadata = { title: 'Asistente' }

type SearchParams = Promise<{ dia?: string }>

// Reception's guide to fill the courts: the day's free slots, where a match is worth building and the flyer.
export default async function AssistantPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/asistente')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const date = isLocalDate(dia) && dia >= today ? dia : today
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))

  const { grid, board } = await loadAssistantDay(club, date, viewer, now)
  const siteUrl = getSiteUrl()
  const recommended = recommendedSlots(board, now, club.match_close_hours).map((slot) => ({
    slot,
    text: recommendationText(slot, club.timezone),
  }))

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <p className="text-fg-muted">
        Mirá qué turnos quedan libres, armá partidos donde hay gente que suele jugar y difundí los libres.
      </p>
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/club/asistente" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <AssistantScreen
            board={board}
            recommended={recommended}
            timezone={club.timezone}
            siteUrl={siteUrl}
            createAction={createStaffMatch}
            inviteAction={inviteToMatch}
          />
        </div>
        <FlyerShare
          imageUrl={`/club/asistente/flyer?date=${date}`}
          fileName={`turnos-libres-${date}.png`}
          text={flyerText({ date, layout: flyerLayout(grid), url: siteUrl, phone: club.phone })}
        />
      </div>
    </>
  )
}
