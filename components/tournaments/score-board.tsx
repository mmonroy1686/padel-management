import type { FormAction } from '@/components/ui/action-form'
import { timeIn } from '@/lib/domain/format'
import { entryNames, gamesByRound, missingScores, teamName, type Tournament } from '@/lib/domain/tournaments'
import { ScoreForm } from './score-form'

// Design: "Resultados". One form per game, round by round; each one can be corrected until it finishes.
export function ScoreBoard({ tournament, timezone, action }: { tournament: Tournament; timezone: string; action: FormAction }) {
  const names = entryNames(tournament)
  const missing = missingScores(tournament.games)
  return (
    <section aria-labelledby="resultados" className="flex flex-col gap-4">
      <div>
        <h2 id="resultados" className="font-display text-2xl font-bold uppercase">
          Resultados
        </h2>
        <p className="text-sm text-fg-muted">
          {missing === 0 ? 'Están todos cargados.' : `Faltan ${missing} de ${tournament.games.length}.`}
        </p>
      </div>
      {gamesByRound(tournament.games).map(({ round, games }) => (
        <section key={round} aria-labelledby={`ronda-${round}`} className="flex flex-col gap-2">
          <h3 id={`ronda-${round}`} className="font-display text-xl font-bold uppercase">
            Ronda {round}
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {games.map((game) => (
              <li key={game.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm text-fg-muted">
                  {timeIn(game.startsAt, timezone)}, {game.courtName}
                </p>
                <ScoreForm
                  gameId={game.id}
                  teamA={teamName(game.teamA, names)}
                  teamB={teamName(game.teamB, names)}
                  pointsPerGame={tournament.pointsPerGame}
                  scoreA={game.scoreA}
                  action={action}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
