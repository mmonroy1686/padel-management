import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { RankingRow } from '@/lib/domain/tournament-ranking'

// The top three of the ranking, the champion in the middle and highest. While the tournament is
// played the first place reads "Va ganando"; with no result yet there is no podium.
export function Podium({
  rows,
  finished,
  highlightEntryId = null,
}: {
  rows: RankingRow[]
  finished: boolean
  highlightEntryId?: string | null
}) {
  const top = rows.slice(0, 3)
  if (top.length === 0 || top.every((row) => row.played === 0)) return null

  const places = [
    { label: finished ? 'Campeón' : 'Va ganando', step: 'h-24', order: 'order-2', tone: 'bg-accent text-on-accent' },
    { label: '2.º', step: 'h-16', order: 'order-1', tone: 'bg-court text-on-court' },
    { label: '3.º', step: 'h-12', order: 'order-3', tone: 'bg-surface text-fg border border-border' },
  ]
  return (
    <ol aria-label="Podio" className="grid grid-cols-3 items-end gap-2">
      {top.map((row, index) => {
        const place = places[index]
        const mine = row.entryId === highlightEntryId
        return (
          <li key={row.entryId} className={cn('flex min-w-0 flex-col items-center gap-2 text-center', place.order)}>
            {index === 0 ? <Icon name="trophy" className="size-8 text-accent-ink" /> : null}
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{place.label}</span>
            <span className={cn('w-full break-words text-sm font-semibold leading-tight', mine && 'text-accent-ink')}>
              {row.name}
              {mine ? ' (vos)' : ''}
            </span>
            <span
              className={cn(
                'flex w-full items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-bold tabular-nums',
                place.step,
                place.tone,
              )}
            >
              {row.points} pts
            </span>
          </li>
        )
      })}
    </ol>
  )
}
