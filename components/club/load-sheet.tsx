'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { blockEndOptions, type GridCell, type GridRow } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

type LoadKind = 'booking' | 'series' | 'block'

// What reception loads on a free cell: a booking (for a member or a name) or a block.
export function LoadSheet({
  cell,
  date,
  dayText,
  rows,
  members,
  action,
  onClose,
  onDone,
}: {
  cell: GridCell
  date: LocalDate
  dayText: string
  rows: GridRow[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [kind, setKind] = useState<LoadKind>('booking')
  const [holder, setHolder] = useState<'guest' | 'player'>('guest')
  const ends = blockEndOptions(rows, cell)

  return (
    <BottomSheet open onClose={onClose} title="Cargar turno">
      <p className="mb-4 text-fg-muted">
        {cell.court.name}, {dayText}, {cell.slot.label}.{' '}
        {cell.price === null ? 'Este horario no tiene precio: solo se puede bloquear.' : formatPrice(cell.price)}
      </p>
      <ActionForm action={action} submitLabel="Guardar" onDone={onDone}>
        <input type="hidden" name="courtId" value={cell.court.id} />
        <input type="hidden" name="startsAt" value={cell.slot.startsAt.toISOString()} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="startTime" value={cell.slot.label} />
        <Field label="Tipo" htmlFor="kind">
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as LoadKind)}
            className={inputClasses}
          >
            <option value="booking">Reserva</option>
            <option value="series">Turno fijo</option>
            <option value="block">Bloqueo</option>
          </select>
        </Field>
        {kind === 'block' ? (
          <>
            <Field label="Hasta" htmlFor="endsAt">
              <select id="endsAt" name="endsAt" className={inputClasses}>
                {ends.map((end) => (
                  <option key={end.value} value={end.value}>
                    {end.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motivo" htmlFor="note">
              <input id="note" name="note" maxLength={80} placeholder="Ej: Clase de Pablo" className={inputClasses} />
            </Field>
          </>
        ) : (
          <>
            <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
            {kind === 'series' ? (
              <>
                <Field label="Hasta (opcional)" htmlFor="endsOn">
                  <input id="endsOn" name="endsOn" type="date" min={date} className={inputClasses} />
                </Field>
                <p className="text-sm text-fg-muted">
                  Se repite todas las semanas a esta hora. Reservamos 8 semanas adelante y seguimos cada día.
                </p>
              </>
            ) : null}
          </>
        )}
      </ActionForm>
    </BottomSheet>
  )
}

export function HolderFields({
  holder,
  onHolderChange,
  members,
}: {
  holder: 'guest' | 'player'
  onHolderChange: (holder: 'guest' | 'player') => void
  members: MemberOption[]
}) {
  return (
    <>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-semibold">Titular</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="holder" value="guest" checked={holder === 'guest'} onChange={() => onHolderChange('guest')} />
          A nombre de alguien
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="holder" value="player" checked={holder === 'player'} onChange={() => onHolderChange('player')} />
          Jugador del club
        </label>
      </fieldset>
      {holder === 'guest' ? (
        <Field label="A nombre de" htmlFor="guestName">
          <input id="guestName" name="guestName" required maxLength={60} placeholder="Ej: Rodríguez" className={inputClasses} />
        </Field>
      ) : (
        <Field label="Jugador" htmlFor="playerId">
          <select id="playerId" name="playerId" required className={inputClasses}>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  )
}
