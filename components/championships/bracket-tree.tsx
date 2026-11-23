import { cn } from '@/lib/cn'
import type { Bracket, MatchView } from '@/lib/domain/championship-views'

// The draw: one column per round, each match a compact box, lines joining each pair of matches to the one they feed.
// Every column splits its height evenly, so a match sits centered between its two feeders; the lines are borders
// (a 1rem stub out of each match, a vertical joining the pair, a 1rem stub into the next match), across a 2rem gap.
export function BracketTree({ bracket }: { bracket: Bracket }) {
  const last = bracket.rounds.length - 1
  return (
    <section aria-label={`Cuadro de ${bracket.categoryName}`} className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <ol className="flex min-w-max gap-8">
          {bracket.rounds.map((round, index) => (
            <li key={round.round} className="flex w-64 snap-start flex-col gap-3">
              <h4 className="rounded-xl bg-bg px-3 py-2 text-center text-sm font-bold">
                {round.name} <span className="font-normal text-fg-muted">({round.matches.length} {round.matches.length === 1 ? 'partido' : 'partidos'})</span>
              </h4>
              <div className="flex flex-1 flex-col">
                {pairs(round.matches).map((pair, pairIndex) => (
                  <div
                    key={pairIndex}
                    data-pair
                    className={cn(
                      'relative flex flex-1 flex-col',
                      index < last && pair.length === 2 && 'before:absolute before:bottom-1/4 before:left-[calc(100%+1rem)] before:top-1/4 before:border-l before:border-border',
                    )}
                  >
                    {pair.map((match) => (
                      <div
                        key={match.id}
                        className={cn(
                          'relative flex flex-1 items-center py-2',
                          index < last && 'after:absolute after:left-full after:top-1/2 after:w-4 after:border-t after:border-border',
                          index > 0 && 'before:absolute before:right-full before:top-1/2 before:w-4 before:border-t before:border-border',
                        )}
                      >
                        <DrawMatch match={match} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function pairs(matches: MatchView[]): MatchView[][] {
  const result: MatchView[][] = []
  for (let index = 0; index < matches.length; index += 2) result.push(matches.slice(index, index + 2))
  return result
}

function DrawMatch({ match }: { match: MatchView }) {
  const when = [match.day && match.time ? `${match.day} ${match.time}` : null, match.court].filter(Boolean).join(' · ')
  return (
    // A line above and one below of the same height keep the box at the middle, where the connectors meet it.
    <article aria-label={`${match.name}: ${match.sideA} contra ${match.sideB}`} className="flex w-full flex-col gap-1">
      <p className="h-4 truncate px-1 text-xs leading-4 text-fg-muted">{match.name}</p>
      <div className={cn('overflow-hidden rounded-xl border bg-surface', match.status === 'playing' ? 'border-accent' : 'border-border')}>
        <DrawSide match={match} side="a" />
        <div className="border-t border-border" />
        <DrawSide match={match} side="b" />
      </div>
      <p className="h-4 truncate px-1 text-xs leading-4 text-accent-ink">{when}</p>
    </article>
  )
}

function DrawSide({ match, side }: { match: MatchView; side: 'a' | 'b' }) {
  const name = side === 'a' ? match.sideA : match.sideB
  const known = (side === 'a' ? match.entryA : match.entryB) !== null
  const won = match.winner === side
  return (
    <div data-winner={won} className="flex min-h-10 items-stretch">
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center truncate px-2 text-sm',
          won && 'font-bold',
          match.winner !== null && !won && 'text-fg-muted',
          !known && 'italic text-fg-muted',
        )}
      >
        <span className="truncate">{name}</span>
        {won ? <span className="sr-only"> (ganó)</span> : null}
      </span>
      {match.sets.map((set, index) => (
        <span
          key={index}
          className={cn(
            'grid w-8 shrink-0 place-items-center font-display text-lg font-bold tabular-nums',
            won ? 'bg-accent text-on-accent' : 'bg-bg text-fg-muted',
          )}
        >
          {side === 'a' ? set.a : set.b}
        </span>
      ))}
    </div>
  )
}
