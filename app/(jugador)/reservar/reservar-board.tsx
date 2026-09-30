'use client'

import { useCallback, useState } from 'react'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { CreateMatchSheet, type MatchFormInitial } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { cn } from '@/lib/cn'
import { visibleRows, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MatchFormOptions } from '@/lib/domain/matches'
import type { LocalDate } from '@/lib/domain/time'

export function ReservarBoard({
  courts,
  rows,
  dayText,
  paymentNote,
  cancellationRule,
  bookAction,
  date,
  matchOptions,
  createMatchAction,
}: {
  courts: Court[]
  rows: GridRow[]
  dayText: string
  paymentNote: string
  cancellationRule: string
  bookAction: FormAction
  date: LocalDate
  matchOptions: MatchFormOptions
  createMatchAction: FormAction
}) {
  const [choice, setChoice] = useState<BookingChoice | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [matchInitial, setMatchInitial] = useState<MatchFormInitial | null>(null)
  const close = useCallback(() => setChoice(null), [])
  const booked = useCallback((message: string) => {
    setChoice(null)
    setNotice(message)
  }, [])

  const pastCount = rows.filter((row) => row.past).length
  const shown = visibleRows(rows, { onlyFree, showPast })

  function select(cell: GridCell) {
    if (cell.state !== 'free' || cell.price === null) return
    setNotice(null)
    setChoice({
      courtId: cell.court.id,
      courtName: cell.court.name,
      startsAt: cell.slot.startsAt.toISOString(),
      timeLabel: cell.slot.label,
      price: cell.price,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend variant="player" />
        <button
          type="button"
          aria-pressed={onlyFree}
          onClick={() => setOnlyFree((value) => !value)}
          className={cn(
            'min-h-11 rounded-full border px-4 text-sm font-semibold',
            onlyFree ? 'border-accent bg-accent text-on-accent' : 'border-border text-fg',
          )}
        >
          Solo libres
        </button>
      </div>
      {pastCount > 0 && !showPast ? (
        <p className="text-sm text-fg-muted">
          Ocultamos {pastCount} {pastCount === 1 ? 'horario que ya pasó' : 'horarios que ya pasaron'}.{' '}
          <button type="button" className="font-semibold text-accent-ink underline" onClick={() => setShowPast(true)}>
            Mostrar
          </button>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <SlotGrid courts={courts} rows={shown} variant="player" onSelect={select} />
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan horarios libres este día. Probá con otro día.</p>
      )}
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
    </div>
  )
}
