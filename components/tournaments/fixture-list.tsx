import { timeIn } from '@/lib/domain/format'
import { scoreB } from '@/lib/domain/tournament-ranking'
import { entryNames, gamesByRound, teamName, type Tournament } from '@/lib/domain/tournaments'

// Every round with its games: when, where, who against whom and the result once it is in.
export function FixtureList({ tournament, timezone }: { tournament: Tournament; timezone: string }) {
  const names = entryNames(tournament)
  return (
    <div className="flex flex-col gap-4">
      {gamesByRound(tournament.games).map(({ round, games }) => (
        <section key={round} aria-labelledby={`ronda-${round}`} className="flex flex-col gap-2">
          <h3 id={`ronda-${round}`} className="font-display text-xl font-bold uppercase">
            Ronda {round}
          </h3>
          <ul className="flex flex-col gap-2">
            {games.map((game) => (
              <li key={game.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="text-fg-muted">
                  {timeIn(game.startsAt, timezone)}, {game.courtName}
                </p>
                <p>
                  <span className="font-semibold">{teamName(game.teamA, names)}</span>{' '}
                  {game.scoreA === null ? 'vs' : `${game.scoreA} a ${scoreB(game.scoreA, tournament.pointsPerGame)}`}{' '}
                  <span className="font-semibold">{teamName(game.teamB, names)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
