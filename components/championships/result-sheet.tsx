'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { inputClasses } from '@/components/ui/field'
import type { MatchRules } from '@/lib/domain/championship-results'
import type { MatchView } from '@/lib/domain/championship-views'

const SETS = [1, 2, 3]

function rulesText(rules: MatchRules): string {
  const third = rules.thirdSet === 'super_tiebreak' ? ' El tercer set es un súper tie-break a 10.' : ''
  return rules.timeLimit === null
    ? `Al mejor de 3 sets, con tie-break en 6-6.${third}`
    : `${rules.timeLimit} minutos de juego: si se termina el tiempo, cargá el marcador como quedó.${third}`
}

// Design: "Cargar resultado": the games of each pair per set, checked against the category's rules (the action
// says what is wrong). It also corrects a result: the sheet starts with the sets saved.
export function ResultSheet({
  championshipId,
  match,
  rules,
  action,
  onClose,
  onDone,
}: {
  championshipId: string
  match: MatchView
  rules: MatchRules
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  return (
    <BottomSheet open onClose={onClose} title="Cargar resultado">
      <p className="font-semibold">{`${match.categoryName} · ${match.name}`}</p>
      <p className="mb-3 text-sm text-fg-muted">{rulesText(rules)}</p>
      <ActionForm action={action} submitLabel="Guardar resultado" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="matchId" value={match.id} />
        {SETS.map((number) => (
          <fieldset key={number} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">
              {number === 3 && rules.thirdSet === 'super_tiebreak' ? 'Set 3 (súper tie-break)' : `Set ${number}`}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(['a', 'b'] as const).map((side) => {
                const name = side === 'a' ? match.sideA : match.sideB
                // The set being played is not a result yet: the sheet starts from the closed ones.
                const saved = match.sets.filter((item) => !item.inProgress)[number - 1]
                return (
                  <label key={side} className="flex flex-col gap-1 text-sm">
                    <span>{name}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      name={`${side}${number}`}
                      aria-label={`Set ${number} · ${name}`}
                      defaultValue={saved ? String(side === 'a' ? saved.a : saved.b) : ''}
                      className={inputClasses}
                    />
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
      </ActionForm>
    </BottomSheet>
  )
}
