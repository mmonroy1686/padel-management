'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { scoreB } from '@/lib/domain/tournament-ranking'

// Reception types team A's points; team B's are the rest of the game (record_tournament_score).
export function ScoreForm({
  gameId,
  teamA,
  teamB,
  pointsPerGame,
  scoreA,
  action,
}: {
  gameId: string
  teamA: string
  teamB: string
  pointsPerGame: number
  scoreA: number | null
  action: FormAction
}) {
  const [value, setValue] = useState(scoreA === null ? '' : String(scoreA))
  const typed = /^\d+$/.test(value) ? Number(value) : null
  const other = typed !== null && typed <= pointsPerGame ? scoreB(typed, pointsPerGame) : null
  const id = `score-${gameId}`

  return (
    <ActionForm action={action} submitLabel="Guardar" pendingLabel="Guardando…" variant="secondary">
      <input type="hidden" name="gameId" value={gameId} />
      <Field label={`Puntos de ${teamA}`} htmlFor={id}>
        <input
          id={id}
          name="scoreA"
          type="number"
          inputMode="numeric"
          min={0}
          max={pointsPerGame}
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClasses}
        />
      </Field>
      <p className="text-sm" aria-live="polite">
        {teamB}: {other ?? '–'}
      </p>
    </ActionForm>
  )
}
