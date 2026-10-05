'use client'

import { useCallback, useState } from 'react'
import { BookingSheet, type BookingChoice } from '@/components/booking/booking-sheet'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { CreateMatchSheet, type MatchFormInitial } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { WaitSheet, type WaitInitial } from '@/components/waitlist/wait-sheet'
import { cn } from '@/lib/cn'
import { visibleRows, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MatchFormOptions } from '@/lib/domain/matches'
import type { LocalDate } from '@/lib/domain/time'
import { slotEndLabel, type TimeOption, type WaitItem } from '@/lib/domain/waitlist'

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
  waitOptions,
  activeWaits,
  waitAction,
  cancelWaitAction,
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
  waitOptions: { from: TimeOption[]; to: TimeOption[] }
  activeWaits: WaitItem[]
  waitAction: FormAction
  cancelWaitAction: FormAction
}) {
  const [choice, setChoice] = useState<BookingChoice | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [matchInitial, setMatchInitial] = useState<MatchFormInitial | null>(null)
  const [waitOpen, setWaitOpen] = useState(false)
  const [waitInitial, setWaitInitial] = useState<WaitInitial | null>(null)
  const close = useCallback(() => setChoice(null), [])
  const booked = useCallback((message: string) => {
    setChoice(null)
    setNotice(message)
  }, [])
  const closeWait = useCallback(() => setWaitOpen(false), [])
  const waited = useCallback((message: string) => {
    setWaitOpen(false)
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

  function openWait(initial: WaitInitial | null) {
    setNotice(null)
    setWaitInitial(initial)
    setWaitOpen(true)
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
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-1 align-middle font-semibold text-accent-ink underline"
            onClick={() => setShowPast(true)}
          >
            Mostrar
          </button>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <SlotGrid
          courts={courts}
          rows={shown}
          variant="player"
          onSelect={select}
          onWait={(cell) => openWait({ fromTime: cell.slot.label, toTime: slotEndLabel(cell.slot), courtIds: [cell.court.id] })}
        />
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan horarios libres este día. Probá con otro día.</p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth onClick={() => openWait(null)}>
          Avisame si se libera
        </Button>
        <p className="text-sm text-fg-muted">
          ¿No encontrás lugar? Anotate y, si se libera un turno, te lo guardamos unos minutos. También podés tocar una cancha ocupada.
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
