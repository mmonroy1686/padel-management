import { MatchLine } from '@/components/championships/match-line'
import { cn } from '@/lib/cn'
import type { Bracket } from '@/lib/domain/championship-views'

// Design: "llaves": one column per round, first round first, each match a scoreboard; on a phone the rounds slide
// sideways one by one; large is the TV mode.
// showTitle: false where the page already names the bracket (the TV screen title).
export function BracketView({ bracket, large = false, showTitle = true }: { bracket: Bracket; large?: boolean; showTitle?: boolean }) {
  return (
    <section aria-label={`Llave de ${bracket.categoryName}`} className="flex flex-col gap-3">
      {showTitle ? (
        <h3 className={cn('font-display text-xl font-bold uppercase', large && 'text-4xl')}>{`Llave · ${bracket.categoryName}`}</h3>
      ) : null}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {bracket.rounds.map((round) => (
          <div
            key={round.round}
            className={cn('flex w-[85%] shrink-0 snap-start flex-col gap-3 sm:w-80 lg:w-96', large && 'w-auto min-w-[28rem] flex-1')}
          >
            <h4
              className={cn(
                'self-start rounded-full bg-bg px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-ink ring-1 ring-border',
                large && 'px-5 py-2 text-2xl',
              )}
            >
              {round.name}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {round.matches.map((match) => (
                <div key={match.id} className={cn('rounded-2xl border border-border bg-surface p-3', large && 'p-6')}>
                  <MatchLine match={match} large={large} showName={round.matches.length > 1} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
