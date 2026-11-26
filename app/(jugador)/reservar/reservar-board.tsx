'use client'

import { BookingNextSteps } from '@/components/booking/booking-next-steps'
import { FullDayNotice } from '@/components/booking/full-day-notice'
import { Notice } from '@/components/ui/notice'
import { SELECTED } from '@/components/ui/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { CreateMatchSheet, type MatchFormInitial } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { DayWaitsNote } from '@/components/waitlist/day-waits-note'
import { WaitSheet, type WaitInitial } from '@/components/waitlist/wait-sheet'
import { cn } from '@/lib/cn'
import { slotParam, visibleRows, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MatchFormOptions } from '@/lib/domain/matches'
import type { LocalDate } from '@/lib/domain/time'
import { slotEndLabel, waitCovers, waitRangeText, type TimeOption, type Wait, type WaitItem } from '@/lib/domain/waitlist'

export function ReservarBoard({
  courts,
  rows,
  dayText,
  paymentNote,
  transferDetails,
  cancellationRule,
  bookAction,
  date,
  matchOptions,
  createMatchAction,
  waitOptions,
  activeWaits,
  dayWaits,
  waitAction,
  cancelWaitAction,
  full,
  openSlot,
}: {
  courts: Court[]
  rows: GridRow[]
  dayText: string
  paymentNote: string
  // The club's transfer details, shown right after booking (null when it does not take transfers).
  transferDetails: string | null
  cancellationRule: string
  bookAction: FormAction
  date: LocalDate
  matchOptions: MatchFormOptions
  createMatchAction: FormAction
  waitOptions: { from: TimeOption[]; to: TimeOption[] }
  activeWaits: WaitItem[]
  // Her waits for the day shown: the note above the grid and the bell on the slots they cover.
  dayWaits: Wait[]
  waitAction: FormAction
  cancelWaitAction: FormAction
  // A day with nothing free: the way to the next day with room (null when nothing is free all week). Undefined: the
  // day has room.
  full?: { href: string; label: string } | null
  // "court-1@18:30" (slotParam): a slot chosen on Inicio, its booking sheet open on arrival if it is still free.
  openSlot?: string
}) {
  const [choice, setChoice] = useState<BookingChoice | null>(() => {
    const cell = rows.flatMap((row) => row.cells).find((candidate) => slotParam({ courtId: candidate.court.id, time: candidate.slot.label }) === openSlot)
    return cell ? choiceOf(cell) : null
  })
  const [onlyFree, setOnlyFree] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // A booking just went through: show how to pay under the notice.
  const [justBooked, setJustBooked] = useState(false)
  const [matchInitial, setMatchInitial] = useState<MatchFormInitial | null>(null)
  const [waitOpen, setWaitOpen] = useState(false)
  const [waitInitial, setWaitInitial] = useState<WaitInitial | null>(null)
  const close = useCallback(() => setChoice(null), [])
  const booked = useCallback((message: string) => {
    setChoice(null)
    setNotice(message)
    setJustBooked(true)
  }, [])
  const closeWait = useCallback(() => setWaitOpen(false), [])
  const waited = useCallback((message: string) => {
    setWaitOpen(false)
    setNotice(message)
    setJustBooked(false)
  }, [])

  // The outcome of an action shows on top of the grid: bring it into view.
  const noticeRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [notice])

  const pastCount = rows.filter((row) => row.past).length
  const shown = visibleRows(rows, { onlyFree, showPast })

  function select(cell: GridCell) {
    const next = choiceOf(cell)
    if (!next) return
    setNotice(null)
    setChoice(next)
  }

  function openWait(initial: WaitInitial | null) {
    setNotice(null)
    setWaitInitial(initial)
    setWaitOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Notice ref={noticeRef} onDismiss={() => setNotice(null)}>{notice}</Notice>
      ) : null}
      {notice && justBooked ? <BookingNextSteps paymentNote={paymentNote} transferDetails={transferDetails} /> : null}
      <DayWaitsNote items={dayWaits.map((wait) => waitRangeText(wait, courts))} onOpen={() => openWait(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend variant="player" />
        <button
          type="button"
          aria-pressed={onlyFree}
          onClick={() => setOnlyFree((value) => !value)}
          className={cn(
            'min-h-11 rounded-full border px-4 text-sm font-semibold',
            onlyFree ? SELECTED : 'border-border text-fg',
          )}
        >
          Solo libres
        </button>
      </div>
      {pastCount > 0 && !showPast ? (
        <p className="text-sm text-fg-muted">
          Ocultamos {pastCount} {pastCount === 1 ? 'horario que ya pasó' : 'horarios que ya pasaron'}.{' '}
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-1 align-middle font-semibold text-accent-ink underline"
            onClick={() => setShowPast(true)}
          >
            Mostrar
          </button>
        </p>
      ) : null}
      {full !== undefined ? <FullDayNotice full={full} /> : null}
      {shown.length > 0 ? (
        <SlotGrid
          courts={courts}
          rows={shown}
          variant="player"
          onSelect={select}
          onWait={(cell) => openWait({ fromTime: cell.slot.label, toTime: slotEndLabel(cell.slot), courtIds: [cell.court.id] })}
          waited={(cell) => dayWaits.some((wait) => waitCovers(wait, date, cell.court.id, cell.slot))}
        />
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan horarios libres este día. Probá con otro día.</p>
      )}
      <div className="flex flex-col gap-2">
        {/* Under the grid and quiet: the screen's action is booking a free slot. */}
        <p className="text-sm text-fg-muted">
          ¿No encontrás lugar? Tocá una cancha ocupada o{' '}
          <button type="button" onClick={() => openWait(null)} className="-my-3 py-3 font-semibold text-accent-ink underline underline-offset-4">
            avisame si se libera
          </button>
          : si se libera un turno, te lo guardamos unos minutos.
        </p>
      </div>
      <BookingSheet
        choice={choice}
        dayText={dayText}
        paymentNote={paymentNote}
        cancellationRule={cancellationRule}
        action={bookAction}
        onClose={close}
        onBooked={booked}
        onCreateMatch={(picked) => {
          setChoice(null)
          setMatchInitial({ date, time: picked.timeLabel, courtId: picked.courtId })
        }}
      />
      <CreateMatchSheet
        open={matchInitial !== null}
        onClose={() => setMatchInitial(null)}
        action={createMatchAction}
        options={matchOptions}
        initial={matchInitial ?? undefined}
      />
      <WaitSheet
        open={waitOpen}
        onClose={closeWait}
        date={date}
        dayText={dayText}
        courts={courts}
        options={waitOptions}
        initial={waitInitial}
        activeWaits={activeWaits}
        createAction={waitAction}
        cancelAction={cancelWaitAction}
        onDone={waited}
      />
    </div>
  )
}

// A free slot with a price, as the booking sheet takes it; null for anything else.
function choiceOf(cell: GridCell): BookingChoice | null {
  if (cell.state !== 'free' || cell.price === null) return null
  return { courtId: cell.court.id, courtName: cell.court.name, startsAt: cell.slot.startsAt.toISOString(), timeLabel: cell.slot.label, price: cell.price }
}
