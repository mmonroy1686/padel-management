'use client'

import { useCallback, useId, useState, type ReactNode } from 'react'
import { MatchLine } from '@/components/championships/match-line'
import { ResultSheet } from '@/components/championships/result-sheet'
import { WalkoverSheet } from '@/components/championships/walkover-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { liveFinish } from '@/lib/domain/championship-live'
import type { MatchRules } from '@/lib/domain/championship-results'
import type { MatchView } from '@/lib/domain/championship-views'

export type DayBoardActions = {
  start: FormAction
  result: FormAction
  walkover: FormAction
  score: FormAction
  undo: FormAction
}
type Sheet = { kind: 'result' | 'walkover'; match: MatchView }

const DEFAULT_RULES: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }

// Design: "Día del torneo": "En juego ahora" with the live score ("+1" for each pair, "Deshacer" and, once the score
// is a result, "Terminar partido"), "Próximos" with "Empezar", "Cargar resultado" and "W.O.", and the last ones
// played, to correct a result.
export function MatchDayBoard({
  championshipId,
  playing,
  upcoming,
  finished,
  rules,
  actions,
}: {
  championshipId: string
  playing: MatchView[]
  upcoming: MatchView[]
  finished: MatchView[]
  // Category id → its rules (the result sheet explains them).
  rules: Record<string, MatchRules>
  actions: DayBoardActions
}) {
  const id = useId()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  // A game loaded says nothing (the score is the answer) and clears the last notice.
  const quiet = useCallback(() => setNotice(null), [])

  const list = (key: string, title: string, matches: MatchView[], empty: string, buttons: (match: MatchView) => ReactNode) => (
    <section aria-labelledby={`${id}-${key}`} className="flex flex-col gap-2">
      <h3 id={`${id}-${key}`} className="font-display text-xl font-bold uppercase">
        {title}
      </h3>
      {matches.length === 0 ? (
        <p className="text-fg-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {matches.map((match) => (
            <li
              key={match.id}
              className={cn(
                'flex flex-col gap-3 rounded-2xl border bg-surface p-4',
                match.status === 'playing' ? 'border-2 border-accent' : 'border-border',
              )}
            >
              <MatchLine match={match} showCategory />
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">{buttons(match)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
  const resultButtons = (match: MatchView) => (
    <>
      <Button variant="secondary" onClick={() => setSheet({ kind: 'result', match })}>
        Cargar resultado
      </Button>
      <Button variant="ghost" onClick={() => setSheet({ kind: 'walkover', match })}>
        W.O.
      </Button>
    </>
  )

  const liveButtons = (match: MatchView) => {
    const finish = liveFinish(match.sets, rules[match.categoryId] ?? DEFAULT_RULES)
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {(['a', 'b'] as const).map((side) => (
            <ActionForm
              key={side}
              action={actions.score}
              submitLabel={`+1 ${side === 'a' ? match.sideA : match.sideB}`}
              pendingLabel="Sumando…"
              onDone={quiet}
              // The pair's full name, in plain small letters: it fits a phone in one or two lines.
              className="[&_button]:min-h-14 [&_button]:px-3 [&_button]:font-sans [&_button]:text-sm [&_button]:normal-case [&_button]:leading-tight [&_button]:tracking-normal"
            >
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="side" value={side} />
            </ActionForm>
          ))}
        </div>
        {finish ? (
          <ActionForm action={actions.result} submitLabel={finish.label} pendingLabel="Guardando…" onDone={setNotice}>
            <input type="hidden" name="championshipId" value={championshipId} />
            <input type="hidden" name="matchId" value={match.id} />
            {[1, 2, 3].flatMap((number) => [
              <input key={`a${number}`} type="hidden" name={`a${number}`} value={finish.sets[number - 1]?.[0] ?? ''} />,
              <input key={`b${number}`} type="hidden" name={`b${number}`} value={finish.sets[number - 1]?.[1] ?? ''} />,
            ])}
          </ActionForm>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {match.sets.length > 0 ? (
            <ActionForm action={actions.undo} submitLabel="Deshacer" pendingLabel="Deshaciendo…" variant="ghost" onDone={quiet}>
              <input type="hidden" name="matchId" value={match.id} />
            </ActionForm>
          ) : null}
          {resultButtons(match)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? <p role="status">{notice}</p> : null}
      {list('playing', 'En juego ahora', playing, 'No hay partidos en juego.', liveButtons)}
      {list('upcoming', 'Próximos', upcoming, 'No quedan partidos por jugar.', (match) =>
        match.ready ? (
          <>
            <ActionForm action={actions.start} submitLabel="Empezar" pendingLabel="Empezando…" onDone={setNotice}>
              <input type="hidden" name="matchId" value={match.id} />
            </ActionForm>
            {resultButtons(match)}
          </>
        ) : (
          <p className="text-sm text-fg-muted">Espera a sus parejas.</p>
        ),
      )}
      {list('finished', 'Terminados', finished, 'Todavía no hay resultados.', (match) => (
        <Button variant="ghost" onClick={() => setSheet({ kind: 'result', match })}>
          Corregir
        </Button>
      ))}
      {sheet?.kind === 'result' ? (
        <ResultSheet
          championshipId={championshipId}
          match={sheet.match}
          rules={rules[sheet.match.categoryId] ?? DEFAULT_RULES}
          action={actions.result}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'walkover' ? (
        <WalkoverSheet championshipId={championshipId} match={sheet.match} action={actions.walkover} onClose={close} onDone={done} />
      ) : null}
    </div>
  )
}
