'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import type { LocalDate } from '@/lib/domain/time'
import { MAX_ACTIVE_WAITS, type CourtName, type TimeOption, type WaitItem } from '@/lib/domain/waitlist'

export type WaitInitial = { fromTime: string; toTime: string; courtIds: string[] }

type WaitSheetProps = {
  open: boolean
  onClose: () => void
  date: LocalDate
  dayText: string
  courts: CourtName[]
  options: { from: TimeOption[]; to: TimeOption[] }
  // A taken slot the player tapped; null opens the whole day on every court.
  initial: WaitInitial | null
  activeWaits: WaitItem[]
  createAction: FormAction
  cancelAction: FormAction
  onDone: (message: string) => void
}

// Design: "/reservar", the sheet behind "Avisame si se libera" and behind a taken slot.
export function WaitSheet({ open, onClose, options, activeWaits, cancelAction, ...form }: WaitSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Avisame si se libera">
      {activeWaits.length >= MAX_ACTIVE_WAITS ? (
        <FullWaits waits={activeWaits} cancelAction={cancelAction} />
      ) : options.from.length === 0 ? (
        <p className="text-fg-muted">Ya no quedan turnos por jugar este día.</p>
      ) : (
        <WaitForm options={options} {...form} />
      )}
    </BottomSheet>
  )
}

function WaitForm({
  date,
  dayText,
  courts,
  options,
  initial,
  createAction,
  onDone,
}: Pick<WaitSheetProps, 'date' | 'dayText' | 'courts' | 'options' | 'initial' | 'createAction' | 'onDone'>) {
  const [from, setFrom] = useState(initial?.fromTime ?? options.from[0].value)
  const [to, setTo] = useState(initial?.toTime ?? options.to[options.to.length - 1].value)
  const [checked, setChecked] = useState<string[]>(initial?.courtIds ?? courts.map((court) => court.id))
  const ends = options.to.filter((option) => option.value > from)
  const end = ends.some((option) => option.value === to) ? to : (ends[0]?.value ?? '')

  return (
    <ActionForm action={createAction} submitLabel="Anotarme" pendingLabel="Anotando…" onDone={onDone}>
      <input type="hidden" name="date" value={date} />
      <p className="text-fg-muted">
        {dayText}. Si se libera un turno en ese horario, te lo guardamos unos minutos y te avisamos acá y por mail.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor="wait-from">
          <select id="wait-from" name="fromTime" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClasses}>
            {options.from.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hasta" htmlFor="wait-to">
          <select id="wait-to" name="toTime" value={end} onChange={(event) => setTo(event.target.value)} className={inputClasses}>
            {ends.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Canchas</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="courtIds"
              value={court.id}
              checked={checked.includes(court.id)}
              onChange={(event) =>
                setChecked((ids) => (event.target.checked ? [...ids, court.id] : ids.filter((id) => id !== court.id)))
              }
              className="size-5 accent-accent"
            />
            {court.name}
          </label>
        ))}
      </fieldset>
      {checked.length === 0 ? <p className="text-sm">Marcá al menos una cancha.</p> : null}
    </ActionForm>
  )
}

function FullWaits({ waits, cancelAction }: { waits: WaitItem[]; cancelAction: FormAction }) {
  return (
    <div className="flex flex-col gap-3">
      <p>Ya estás esperando {MAX_ACTIVE_WAITS} turnos, el máximo. Cancelá una espera para anotarte en otra.</p>
      <ul className="flex flex-col gap-2">
        {waits.map((wait) => (
          <li key={wait.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <span>{wait.text}</span>
            <ActionForm action={cancelAction} submitLabel="Cancelar espera" pendingLabel="Cancelando…" variant="secondary">
              <input type="hidden" name="waitId" value={wait.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  )
}
