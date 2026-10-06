'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import type { MatchView } from '@/lib/domain/championship-views'

// Design: "W.O.": the pair that did not show up loses 6-0 6-0.
export function WalkoverSheet({
  championshipId,
  match,
  action,
  onClose,
  onDone,
}: {
  championshipId: string
  match: MatchView
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const sides = [
    { entryId: match.entryA, name: match.sideA },
    { entryId: match.entryB, name: match.sideB },
  ]
  return (
    <BottomSheet open onClose={onClose} title="W.O.">
      <p className="mb-3">{`${match.categoryName} · ${match.name}: la pareja que no se presentó pierde 6-0 6-0.`}</p>
      <ActionForm action={action} submitLabel="Guardar W.O." pendingLabel="Guardando…" variant="danger" onDone={onDone}>
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="matchId" value={match.id} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">¿Quién no se presentó?</legend>
          {sides.map((side) =>
            side.entryId ? (
              <label key={side.entryId} className="flex min-h-11 items-center gap-3">
                <input type="radio" name="absentId" value={side.entryId} required className="size-5 accent-accent" />
                <span>{side.name}</span>
              </label>
            ) : null,
          )}
        </fieldset>
      </ActionForm>
    </BottomSheet>
  )
}
