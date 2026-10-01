'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { scoreB } from '@/lib/domain/tournament-ranking'

const STEP = 'inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-xl font-bold text-fg hover:border-accent focus-visible:outline-2 focus-visible:outline-accent'

// Reception types team A's points, or taps − and +; team B's are the rest of the game
// (record_tournament_score).
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
  const step = (delta: number) =>
    setValue(String(Math.min(pointsPerGame, Math.max(0, (typed ?? (delta > 0 ? -1 : 1)) + delta))))
  const id = `score-${gameId}`

  return (
    <ActionForm action={action} submitLabel="Guardar" pendingLabel="Guardando…" variant="secondary">
      <input type="hidden" name="gameId" value={gameId} />
      <label htmlFor={id} className="text-sm font-semibold">
        Puntos de {teamA}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Restar un punto a ${teamA}`} onClick={() => step(-1)} className={STEP}>
          −
        </button>
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
          className="min-h-11 w-20 rounded-xl border border-border bg-bg px-3 text-center font-display text-2xl font-bold tabular-nums text-fg focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button type="button" aria-label={`Sumar un punto a ${teamA}`} onClick={() => step(1)} className={STEP}>
          +
        </button>
      </div>
      <p className="text-sm tabular-nums" aria-live="polite">
        {teamB}: {other ?? '–'}
      </p>
    </ActionForm>
  )
}
