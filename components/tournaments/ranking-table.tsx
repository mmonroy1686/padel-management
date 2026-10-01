import { cn } from '@/lib/cn'
import type { RankingRow } from '@/lib/domain/tournament-ranking'

const CELL = 'py-3 pr-3 text-right tabular-nums'

// Points, then games won, then difference (tournament-ranking.ts). The viewer's row stands out.
export function RankingTable({ rows, highlightEntryId = null }: { rows: RankingRow[]; highlightEntryId?: string | null }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table aria-label="Ranking" className="w-full min-w-[18rem] text-sm">
        <thead>
          <tr className="text-fg-muted">
            <th scope="col" className="py-2 pr-3 text-left">#</th>
            <th scope="col" className="py-2 pr-3 text-left">Jugador</th>
            <th scope="col" className={CELL}><abbr title="Puntos">Pts</abbr></th>
            <th scope="col" className={CELL}><abbr title="Partidos jugados">PJ</abbr></th>
            <th scope="col" className={CELL}><abbr title="Partidos ganados">PG</abbr></th>
            <th scope="col" className={CELL}><abbr title="Diferencia de puntos">Dif</abbr></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mine = row.entryId === highlightEntryId
            return (
              <tr key={row.entryId} aria-current={mine ? 'true' : undefined} className={cn('border-t border-border', mine && 'font-semibold text-accent-ink')}>
                <td className="py-3 pr-3 tabular-nums">
                  {/* Medals for the podium places: gold, blue and the outline, like the podium. */}
                  <span
                    className={cn(
                      'inline-grid size-7 place-items-center rounded-full text-xs font-bold',
                      row.position === 1 && 'bg-accent text-on-accent',
                      row.position === 2 && 'bg-court text-on-court',
                      row.position === 3 && 'border border-fg-muted',
                    )}
                  >
                    {row.position}
                  </span>
                </td>
                <th scope="row" className={cn('py-3 pr-3 text-left', mine ? 'font-semibold' : 'font-normal')}>
                  {row.name}
                  {mine ? ' (vos)' : ''}
                </th>
                <td className={CELL}>{row.points}</td>
                <td className={CELL}>{row.played}</td>
                <td className={CELL}>{row.won}</td>
                <td className={CELL}>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
