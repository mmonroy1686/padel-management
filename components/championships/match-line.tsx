import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { MatchView } from '@/lib/domain/championship-views'

// A match as a scoreboard: the stage and its state on top; each pair on its own row with the games of every set,
// the winner marked (border, check and "Ganó", not only color); when and where at the bottom. large: the TV mode.
export function MatchLine({
  match,
  showCategory = false,
  showName = true,
  large = false,
}: {
  match: MatchView
  showCategory?: boolean
  // false where the round already names it (the bracket).
  showName?: boolean
  large?: boolean
}) {
  const stage = [showCategory ? match.categoryName : null, showName ? match.name : null].filter(Boolean).join(' · ')
  const when = match.day && match.time ? `${match.day} ${match.time}` : null
  const sides = [
    { key: 'a', name: match.sideA, known: match.entryA !== null, won: match.winner === 'a', games: match.sets.map((set) => set.a), rival: match.sets.map((set) => set.b) },
    { key: 'b', name: match.sideB, known: match.entryB !== null, won: match.winner === 'b', games: match.sets.map((set) => set.b), rival: match.sets.map((set) => set.a) },
  ]

  return (
    <article aria-label={`${match.sideA} contra ${match.sideB}`} className={cn('flex flex-col gap-3', large && 'gap-5')}>
      <header className="flex items-start justify-between gap-3">
        <p className={cn('text-xs font-semibold uppercase tracking-wide text-fg-muted', large && 'text-2xl')}>{stage}</p>
        <StatusBadge match={match} large={large} />
      </header>

      <div role="table" aria-label="Resultado" className="flex flex-col gap-1.5">
        {sides.map((side) => (
          <div
            key={side.key}
            role="row"
            data-winner={side.won}
            className={cn(
              'flex items-center gap-3 rounded-xl border-l-4 py-1.5 pl-3 pr-1',
              side.won ? 'border-accent bg-bg' : 'border-transparent',
              large && 'py-3 pl-5',
            )}
          >
            <span
              role="rowheader"
              className={cn(
                'min-w-0 flex-1 leading-tight',
                large ? 'text-3xl' : 'text-base',
                !side.known && 'italic text-fg-muted',
                side.won ? 'font-semibold' : match.winner ? 'text-fg-muted' : null,
              )}
            >
              {side.name}
            </span>
            {side.won ? (
              <span className={cn('flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-ink', large && 'text-xl')}>
                <Icon name="check-circle" className={cn('size-4', large && 'size-7')} />
                Ganó
              </span>
            ) : null}
            {side.games.map((games, index) => (
              <span
                key={index}
                role="cell"
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg font-display text-lg font-bold tabular-nums',
                  games > side.rival[index] ? 'bg-accent text-on-accent' : 'bg-surface text-fg-muted ring-1 ring-border',
                  large && 'size-14 text-4xl',
                )}
              >
                {games}
              </span>
            ))}
          </div>
        ))}
      </div>

      {when || match.court ? (
        <footer className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted', large && 'text-xl')}>
          {when ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className={cn('size-4', large && 'size-6')} />
              {when}
            </span>
          ) : null}
          {match.court ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" className={cn('size-4', large && 'size-6')} />
              {match.court}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}

// The state with its own look: in play pulses in the club's accent, finished with a check, the rest quiet.
function StatusBadge({ match, large }: { match: MatchView; large: boolean }) {
  const base = cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', large && 'px-4 py-2 text-xl')
  if (match.status === 'playing') {
    return (
      <span className={cn(base, 'bg-accent text-on-accent')}>
        <span aria-hidden="true" className={cn('size-2 rounded-full bg-on-accent motion-safe:animate-pulse', large && 'size-3')} />
        {match.statusLabel}
      </span>
    )
  }
  if (match.status === 'finished' || match.status === 'walkover') {
    return <span className={cn(base, 'border border-court-ink text-court-ink')}>{match.statusLabel}</span>
  }
  return <span className={cn(base, 'border border-border text-fg-muted')}>{match.statusLabel}</span>
}
