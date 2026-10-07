import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { MatchView } from '@/lib/domain/championship-views'

// A match as a scoreboard: the stage and its state on top; each pair on its own row with the games of every set,
// the winner marked (border, check and "Ganó", not only color); when and where at the bottom. large: the TV mode;
// with compact, a TV size that still fits several matches stacked (a bracket's rounds).
export function MatchLine({
  match,
  showCategory = false,
  showName = true,
  large = false,
  compact = false,
}: {
  match: MatchView
  showCategory?: boolean
  // false where the round already names it (the bracket).
  showName?: boolean
  large?: boolean
  compact?: boolean
}) {
  const s = large ? (compact ? TV_COMPACT : TV) : NORMAL
  const stage = [showCategory ? match.categoryName : null, showName ? match.name : null].filter(Boolean).join(' · ')
  const when = match.day && match.time ? `${match.day} ${match.time}` : null
  const sides = [
    { key: 'a', name: match.sideA, known: match.entryA !== null, won: match.winner === 'a', games: match.sets.map((set) => set.a), rival: match.sets.map((set) => set.b) },
    { key: 'b', name: match.sideB, known: match.entryB !== null, won: match.winner === 'b', games: match.sets.map((set) => set.b), rival: match.sets.map((set) => set.a) },
  ]

  return (
    <article aria-label={`${match.sideA} contra ${match.sideB}`} className={cn('flex flex-col', s.gap)}>
      <header className="flex items-start justify-between gap-3">
        <p className={cn('font-semibold uppercase tracking-wide text-fg-muted', s.label)}>{stage}</p>
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
              s.row,
            )}
          >
            <span
              role="rowheader"
              className={cn(
                'min-w-0 flex-1 leading-tight',
                s.name,
                !side.known && 'italic text-fg-muted',
                side.won ? 'font-semibold' : match.winner ? 'text-fg-muted' : null,
              )}
            >
              {side.name}
            </span>
            {side.won ? (
              <span className={cn('flex shrink-0 items-center gap-1 font-semibold text-accent-ink', s.label)}>
                <Icon name="check-circle" className={s.icon} />
                Ganó
              </span>
            ) : null}
            {side.games.map((games, index) => {
              // The set being played: amber border, no winner yet, and the "en vivo" dot on the first row.
              const live = match.sets[index]?.inProgress === true
              return (
                <span
                  key={index}
                  role="cell"
                  data-live={live || undefined}
                  aria-label={live ? `${games} (set en juego)` : undefined}
                  className={cn(
                    'relative grid shrink-0 place-items-center rounded-lg font-display font-bold tabular-nums',
                    s.cell,
                    live
                      ? 'bg-bg text-fg ring-2 ring-accent'
                      : games > side.rival[index]
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface text-fg-muted ring-1 ring-border',
                  )}
                >
                  {games}
                  {live && side.key === 'a' ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -right-1 -top-1 size-2.5 rounded-full bg-accent motion-safe:animate-pulse',
                        large && 'size-4',
                      )}
                    />
                  ) : null}
                </span>
              )
            })}
          </div>
        ))}
      </div>

      {when || match.court ? (
        <footer className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted', s.foot)}>
          {when ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className={s.icon} />
              {when}
            </span>
          ) : null}
          {match.court ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" className={s.icon} />
              {match.court}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}

const NORMAL = { gap: 'gap-3', label: 'text-xs', row: 'py-1.5 pl-3', name: 'text-base', icon: 'size-4', cell: 'size-8 text-lg', foot: 'text-sm' }
const TV = { gap: 'gap-5', label: 'text-2xl', row: 'py-3 pl-5', name: 'text-3xl', icon: 'size-7', cell: 'size-14 text-4xl', foot: 'text-xl' }
const TV_COMPACT = { gap: 'gap-2', label: 'text-lg', row: 'py-1.5 pl-4', name: 'text-2xl', icon: 'size-6', cell: 'size-11 text-3xl', foot: 'text-lg' }

// The state with its own look: in play pulses in the club's accent, finished with a check, the rest quiet.
export function StatusBadge({ match, large }: { match: MatchView; large: boolean }) {
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
