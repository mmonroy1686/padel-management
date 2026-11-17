import { MatchCourt } from '@/components/matches/match-court'
import type { FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { Risk } from '@/lib/domain/match-risk'
import { categoryRangeLabel, filledCount, MATCH_TYPE_LABELS, missingText, type Match } from '@/lib/domain/matches'
import { CancelMatchForm, RemovePlayerForm } from './match-staff-actions'

export type FormingMatchItem = { match: Match; timeText: string; risk: Risk | null }

const CHIP = 'rounded-full border border-border px-2 py-0.5 text-xs font-semibold'

// Next to the grid: matches still looking for players, which do not hold a court yet. Each one is an article titled
// by its time and court, with the court drawn (who is in, which spots are open), the risk of losing that court in
// words, and "Gestionar partido" for reception's actions.
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
          {items.map((item) => (
            <li key={item.match.id}>
              <FormingMatchCard {...item} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FormingMatchCard({
  match,
  timeText,
  risk,
  actions,
}: FormingMatchItem & { actions: { cancelMatch: FormAction; removeFromMatch: FormAction } }) {
  const titleId = `armandose-${match.id}`
  const players = match.slots.filter((slot) => slot.playerId)
  return (
    <Card role="article" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 id={titleId} className="font-display text-xl font-bold uppercase">
          {timeText} · {match.preferredCourtName}
        </h3>
        <span className={cn(CHIP, 'shrink-0 border-accent text-accent-ink')}>{filledCount(match)} de 4</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{missingText(match)}</p>
        <span className={CHIP}>{categoryRangeLabel(match.categoryMin, match.categoryMax)}</span>
        <span className={CHIP}>{MATCH_TYPE_LABELS[match.type]}</span>
      </div>

      <MatchCourt match={match} viewerId="" />

      {risk ? (
        <p
          role="note"
          className={cn(
            'flex items-start gap-2 rounded-xl border bg-bg p-3 text-sm',
            risk.level === 'bad' ? 'border-danger' : 'border-accent',
          )}
        >
          <Icon name="alert" className={cn('mt-0.5 shrink-0', risk.level === 'bad' ? 'text-danger' : 'text-accent-ink')} />
          <span>{risk.text}</span>
        </p>
      ) : (
        <p className="text-sm text-fg-muted">Todavía no ocupa la cancha.</p>
      )}

      <details className="group rounded-xl border border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 font-semibold focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          Gestionar partido
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {players.length > 0 ? (
            <ul aria-label="Jugadores" className="flex flex-col gap-2">
              {players.map((slot) => (
                <li key={slot.position} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{slot.playerName ?? 'Jugador'}</span>
                  <RemovePlayerForm
                    matchId={match.id}
                    playerId={slot.playerId ?? ''}
                    playerName={slot.playerName ?? 'Jugador'}
                    action={actions.removeFromMatch}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <CancelMatchForm matchId={match.id} action={actions.cancelMatch} />
        </div>
      </details>
    </Card>
  )
}
