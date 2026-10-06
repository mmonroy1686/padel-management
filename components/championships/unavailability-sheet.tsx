'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { Block } from '@/lib/domain/championships'
import { dayLongLabel } from '@/lib/domain/format'

// Design: "Horarios imposibles": the 2-hour blocks of each day of play the pair cannot play, plus a note.
// max: how many a player may mark by herself (40 %); null for staff, who may mark more.
export function UnavailabilitySheet({
  entryId,
  blocks,
  selected,
  note,
  max,
  action,
  onClose,
  onDone,
}: {
  entryId: string
  blocks: Block[]
  selected: string[]
  note: string | null
  max: number | null
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [chosen, setChosen] = useState<string[]>(selected)
  const days = [...new Set(blocks.map((block) => block.date))].map((date) => ({
    date,
    blocks: blocks.filter((block) => block.date === date),
  }))
  const over = max !== null && chosen.length > max

  return (
    <BottomSheet open onClose={onClose} title="Horarios imposibles">
      <ActionForm action={action} submitLabel="Guardar horarios" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="entryId" value={entryId} />
        <p className="text-sm text-fg-muted">
          Marcá las franjas en las que la pareja no puede jugar.{' '}
          {max !== null
            ? `Hasta ${max} de ${blocks.length}; para más, pedíselo al club.`
            : `Son ${blocks.length} franjas; como organizador podés marcar más del 40 %.`}
        </p>
        {days.map((day) => (
          <fieldset key={day.date} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{dayLongLabel(day.date)}</legend>
            <div className="flex flex-wrap gap-2">
              {day.blocks.map((block) => (
                <label
                  key={block.key}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3',
                    chosen.includes(block.key) ? 'border-accent' : 'border-border',
                  )}
                >
                  <input
                    type="checkbox"
                    name="blocks"
                    value={block.key}
                    checked={chosen.includes(block.key)}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked ? [...current, block.key] : current.filter((key) => key !== block.key),
                      )
                    }
                    className="size-5 accent-accent"
                  />
                  {block.fromTime} a {block.toTime}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {over ? (
          <p role="note" className="rounded-xl border border-accent p-3 text-sm">
            Marcaste {chosen.length}: más de las {max} que se pueden sin pedirle al club.
          </p>
        ) : null}
        <Field label="Nota (opcional)" htmlFor="unavailability-note">
          <textarea
            id="unavailability-note"
            name="note"
            rows={2}
            maxLength={300}
            defaultValue={note ?? ''}
            className={cn(inputClasses, 'py-2')}
          />
        </Field>
      </ActionForm>
    </BottomSheet>
  )
}
