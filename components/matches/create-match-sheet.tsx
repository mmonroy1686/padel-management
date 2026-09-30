'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { MATCH_TYPE_LABELS, MATCH_TYPES, SLOT_SIDE_LABELS, SLOT_SIDES, type MatchFormOptions } from '@/lib/domain/matches'
import { CATEGORIES } from '@/lib/domain/profile'
import type { LocalDate } from '@/lib/domain/time'

export type MatchFormInitial = { date?: LocalDate; time?: string; courtId?: string }

// Prototype: sheet "create". The server turns date and time into an instant on the club's clock.
export function CreateMatchSheet({
  open,
  onClose,
  action,
  options,
  initial = {},
}: {
  open: boolean
  onClose: () => void
  action: FormAction
  options: MatchFormOptions
  initial?: MatchFormInitial
}) {
  const { defaults } = options
  const categoryOptions = CATEGORIES.map((category) => (
    <option key={category} value={category}>
      {category}ª
    </option>
  ))
  return (
    <BottomSheet open={open} onClose={onClose} title="Armar partido abierto">
      <ActionForm
        key={`${initial.date}-${initial.time}-${initial.courtId}`}
        action={action}
        submitLabel="Publicar partido"
        pendingLabel="Publicando…"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día" htmlFor="match-date">
            <select id="match-date" name="date" defaultValue={initial.date ?? options.days[0]?.date} className={inputClasses}>
              {options.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hora" htmlFor="match-time">
            <select
              id="match-time"
              name="time"
              defaultValue={initial.time ?? (options.times.includes('20:00') ? '20:00' : options.times[0])}
              className={inputClasses}
            >
              {options.times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cancha preferida" htmlFor="match-court">
            <select id="match-court" name="courtId" defaultValue={initial.courtId ?? options.courts[0]?.id} className={inputClasses}>
              {options.courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partido" htmlFor="match-type">
            <select id="match-type" name="matchType" defaultValue={defaults.type} className={inputClasses}>
              {MATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MATCH_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría desde" htmlFor="match-min">
            <select id="match-min" name="categoryMin" defaultValue={defaults.categoryMin} className={inputClasses}>
              {categoryOptions}
            </select>
          </Field>
          <Field label="hasta" htmlFor="match-max">
            <select id="match-max" name="categoryMax" defaultValue={defaults.categoryMax} className={inputClasses}>
              {categoryOptions}
            </select>
          </Field>
        </div>
        <Field label="Vos jugás de" htmlFor="match-side">
          <select id="match-side" name="side" defaultValue={defaults.side} className={inputClasses}>
            {SLOT_SIDES.map((side) => (
              <option key={side} value={side}>
                {SLOT_SIDE_LABELS[side]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="allowOtherCourt" defaultChecked className="size-5 accent-accent" />
          Si mi cancha se ocupa, usar otra libre
        </label>
        <p className="text-sm text-fg-muted">La cancha se reserva recién cuando están los 4. Mientras tanto no se bloquea.</p>
      </ActionForm>
    </BottomSheet>
  )
}
