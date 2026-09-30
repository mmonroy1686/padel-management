import type { FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import type { Risk } from '@/lib/domain/match-risk'
import { categoryRangeLabel, MATCH_TYPE_LABELS, missingText, type Match } from '@/lib/domain/matches'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type FormingMatchItem = { match: Match; timeText: string; risk: Risk | null }

// Next to the grid: matches still looking for players, which do not block courts yet.
export function FormingMatchesPanel({
  items,
  actions,
}: {
  items: FormingMatchItem[]
  actions: { cancelMatch: FormAction; removeFromMatch: FormAction }
}) {
  return (
    <section aria-labelledby="armandose" className="flex flex-col gap-3">
      <h2 id="armandose" className="font-display text-2xl font-bold uppercase">
        Partidos armándose
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">Ninguno este día.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ match, timeText, risk }) => (
            <li key={match.id}>
              <Card className="flex flex-col gap-2">
                <p className="font-semibold">
                  {timeText}, {match.preferredCourtName}
                </p>
                <p className="text-sm">
                  {missingText(match)} · {categoryRangeLabel(match.categoryMin, match.categoryMax)},{' '}
                  {MATCH_TYPE_LABELS[match.type].toLowerCase()}
                </p>
                {risk ? (
                  <p role="note" className="text-sm">
                    {risk.text}
                  </p>
                ) : (
                  <p className="text-sm text-fg-muted">No bloquea la cancha.</p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Jugadores y acciones</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {match.slots.flatMap((slot) =>
                      slot.playerId
                        ? [
                            <li key={slot.position} className="flex items-center justify-between gap-2">
                              <span>{slot.playerName}</span>
                              <RemovePlayerForm matchId={match.id} playerId={slot.playerId} action={actions.removeFromMatch} />
                            </li>,
                          ]
                        : [],
                    )}
                  </ul>
                  <CancelMatchForm matchId={match.id} action={actions.cancelMatch} />
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
