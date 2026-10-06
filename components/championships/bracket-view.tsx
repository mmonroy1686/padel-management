import { MatchLine } from '@/components/championships/match-line'
import { cn } from '@/lib/cn'
import type { Bracket } from '@/lib/domain/championship-views'

// Design: "llaves": one column per round, first round first; large is the TV mode.
export function BracketView({ bracket, large = false }: { bracket: Bracket; large?: boolean }) {
  return (
    <section aria-label={`Llave de ${bracket.categoryName}`} className="flex flex-col gap-2">
      <h3 className={cn('font-display text-xl font-bold uppercase', large && 'text-4xl')}>{`Llave · ${bracket.categoryName}`}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {bracket.rounds.map((round) => (
          <div key={round.round} className={cn('flex min-w-56 flex-col justify-around gap-3', large && 'min-w-96')}>
            <h4 className={cn('text-xs font-semibold uppercase tracking-wide text-fg-muted', large && 'text-xl')}>{round.name}</h4>
            {round.matches.map((match) => (
              <div key={match.id} className="rounded-2xl border border-border bg-surface p-3">
                <MatchLine match={match} large={large} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
