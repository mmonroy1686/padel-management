'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'

export type SlotChoice = { value: string; label: string }

// Design: "Mover un partido": another court and time from the valid options (the page computes them for
// ?partido=<id>); closing goes back to the fixture.
export function MoveMatchSheet({
  matchId,
  title,
  options,
  closeHref,
  action,
}: {
  matchId: string
  title: string
  options: SlotChoice[]
  closeHref: string
  action: FormAction
}) {
  const router = useRouter()
  const close = useCallback(() => router.push(closeHref), [router, closeHref])

  return (
    <BottomSheet open onClose={close} title="Mover partido">
      <p className="mb-3">{title}</p>
      {options.length === 0 ? (
        <p>No hay otra cancha ni horario donde entre este partido.</p>
      ) : (
        <ActionForm action={action} submitLabel="Mover" pendingLabel="Moviendo…" onDone={close}>
          <input type="hidden" name="matchId" value={matchId} />
          <Field label="Cancha y horario" htmlFor="move-slot">
            <select id="move-slot" name="slot" defaultValue={options[0].value} className={inputClasses}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      )}
    </BottomSheet>
  )
}
