import { cn } from '@/lib/cn'
import { timeIn } from '@/lib/domain/format'
import { scoreB } from '@/lib/domain/tournament-ranking'
import { currentRound, entryNames, gamesByRound, teamName, type Tournament } from '@/lib/domain/tournaments'

// Every round with its games: when, where, who against whom and the result once it is in. The round
// being played stays open and the others fold; the viewer's games stand out.
export function FixtureList({
  tournament,
  timezone,
  myEntryId = null,
}: {
  tournament: Tournament
  timezone: string
  myEntryId?: string | null
}) {
  const names = entryNames(tournament)
  const current = tournament.status === 'in_progress' ? currentRound(tournament.games) : null
  return (
    <div className="flex flex-col gap-2">
      {gamesByRound(tournament.games).map(({ round, games }) => {
        const played = games.filter((game) => game.scoreA !== null).length
        return (
          <details key={round} open={round === current} className="rounded-2xl border border-border bg-surface open:border-accent">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2">
              <span className="font-display text-xl font-bold uppercase">
                Ronda {round}
                {round === current ? <span className="text-accent-ink"> · en juego</span> : null}
              </span>
              <span className="text-sm text-fg-muted tabular-nums">
                {played === games.length ? 'Jugada' : `${played} de ${games.length}`}
              </span>
            </summary>
            <ul className="flex flex-col gap-2 px-4 pb-4">
              {games.map((game) => {
                const mine = myEntryId !== null && [...game.teamA, ...game.teamB].includes(myEntryId)
                return (
                  <li key={game.id} className={cn('rounded-xl border p-3 text-sm', mine ? 'border-accent bg-bg' : 'border-border')}>
                    <p className="flex justify-between gap-2 text-fg-muted">
                      <span>
                        {timeIn(game.startsAt, timezone)}, {game.courtName}
                      </span>
                      {mine ? <span className="font-semibold text-accent-ink">Tu partido</span> : null}
                    </p>
                    <p>
                      <span className="font-semibold">{teamName(game.teamA, names)}</span>{' '}
                      {game.scoreA === null ? 'vs' : `${game.scoreA} a ${scoreB(game.scoreA, tournament.pointsPerGame)}`}{' '}
                      <span className="font-semibold">{teamName(game.teamB, names)}</span>
                    </p>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
