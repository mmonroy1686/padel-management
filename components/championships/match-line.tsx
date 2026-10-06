import { cn } from '@/lib/cn'
import type { MatchView } from '@/lib/domain/championship-views'

// One match: where and when, both sides (the winner in bold), the score and its state. large: the TV mode.
export function MatchLine({
  match,
  showCategory = false,
  large = false,
}: {
  match: MatchView
  showCategory?: boolean
  large?: boolean
}) {
  const where = [
    showCategory ? match.categoryName : null,
    match.name,
    match.day && match.time ? `${match.day} ${match.time}` : null,
    match.court,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={cn('flex flex-col gap-0.5', large && 'gap-2')}>
      <p className={cn('text-xs font-semibold uppercase tracking-wide text-fg-muted', large && 'text-xl')}>{where}</p>
      <p className={cn(match.winner === 'a' && 'font-semibold', large && 'text-3xl')}>{match.sideA}</p>
      <p className={cn(match.winner === 'b' && 'font-semibold', large && 'text-3xl')}>{match.sideB}</p>
      <p className={cn('text-sm', large && 'text-2xl')}>
        {match.score ? `${match.score} · ${match.statusLabel}` : match.statusLabel}
      </p>
    </div>
  )
}
