import type { Metadata } from 'next'
import { DayStrip } from '@/components/booking/day-strip'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadMatchFormOptions, loadPlayerContext } from '@/lib/data/matches'
import { cancellationRule } from '@/lib/domain/cancellation'
import { dayLabel, dayLongLabel } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { addDays, localDateOf } from '@/lib/domain/time'
import { createMatch } from '../partidos/actions'
import { bookSlot } from './actions'
import { ReservarBoard } from './reservar-board'
import { cancelSlotWait, createSlotWait } from '@/lib/actions/waitlist'
import { loadMyWaitlist } from '@/lib/data/waitlist'
import { waitItems, waitRangeOptions } from '@/lib/domain/waitlist'

export const metadata: Metadata = { title: 'Reservar' }

type SearchParams = Promise<{ dia?: string }>

export default async function ReservarPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/reservar')
  const { club } = viewer
  const { dia } = await searchParams
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))
  const date = isLocalDate(dia) && days.includes(dia) ? dia : today
  const grid = await loadDayGrid(club, date, { userId: viewer.userId, audience: 'player' }, now)
  const context = await loadPlayerContext(viewer, now)
  const matchOptions = await loadMatchFormOptions(viewer, context, today)
  const waitlist = await loadMyWaitlist(viewer, now)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Reservar cancha</h1>
        <p className="text-fg-muted">
          Elegí el día y tocá un horario libre. Turnos de {club.slot_minutes} minutos, precio por cancha completa.
        </p>
      </div>
      <DayStrip days={days.map((day) => ({ date: day, label: dayLabel(day, today) }))} selected={date} basePath="/reservar" />
      <ReservarBoard
        key={date}
        courts={grid.courts}
        rows={grid.rows}
        dayText={dayLongLabel(date)}
        paymentNote={paymentMethodsNote(club)}
        cancellationRule={cancellationRule(club.cancellation_notice_hours)}
        bookAction={bookSlot}
        date={date}
        matchOptions={matchOptions}
        createMatchAction={createMatch}
        waitOptions={waitRangeOptions(grid.rows.map((row) => row.slot), now)}
        activeWaits={waitItems(waitlist.waits, waitlist.courts, today)}
        waitAction={createSlotWait}
        cancelWaitAction={cancelSlotWait}
      />
    </>
  )
}
