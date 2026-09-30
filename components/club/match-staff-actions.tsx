'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

export function RemovePlayerForm({
  matchId,
  playerId,
  action,
  onDone,
}: {
  matchId: string
  playerId: string
  action: FormAction
  onDone?: (message: string) => void
}) {
  return (
    <ActionForm action={action} submitLabel="Sacar del partido" pendingLabel="Sacando…" variant="ghost" onDone={onDone}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="playerId" value={playerId} />
    </ActionForm>
  )
}

export function CancelMatchForm({
  matchId,
  action,
  onDone,
}: {
  matchId: string
  action: FormAction
  onDone?: (message: string) => void
}) {
  return (
    <ActionForm action={action} submitLabel="Cancelar partido" pendingLabel="Cancelando…" variant="secondary" onDone={onDone}>
      <input type="hidden" name="matchId" value={matchId} />
      <Field label="Motivo (opcional)" htmlFor={`note-${matchId}`}>
        <input id={`note-${matchId}`} name="note" maxLength={120} className={inputClasses} />
      </Field>
    </ActionForm>
  )
}
