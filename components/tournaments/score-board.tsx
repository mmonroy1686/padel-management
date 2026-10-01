import type { FormAction } from '@/components/ui/action-form'
import { timeIn } from '@/lib/domain/format'
import { currentRound, entryNames, gamesByRound, missingScores, teamName, type Tournament } from '@/lib/domain/tournaments'
import { ScoreForm } from './score-form'

// Design: "Resultados". Round by round, folded except the one reception is on; every result can be
// corrected until the tournament finishes.
export function ScoreBoard({ tournament, timezone, action }: { tournament: Tournament; timezone: string; action: FormAction }) {
  const names = entryNames(tournament)
  const missing = missingScores(tournament.games)
  const current = currentRound(tournament.games)
  return (
    <section aria-labelledby="resultados" className="flex flex-col gap-3">
      <div>
        <h2 id="resultados" className="font-display text-2xl font-bold uppercase">
          Resultados
        </h2>
        <p className="text-sm text-fg-muted">
          {missing === 0 ? 'Están todos cargados.' : `Faltan ${missing} de ${tournament.games.length}.`}
        </p>
      </div>
      {gamesByRound(tournament.games).map(({ round, games }) => {
        const recorded = games.length - missingScores(games)
        return (
          <details
            key={round}
            open={round === current}
            className="group rounded-2xl border border-border bg-surface open:border-accent"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2">
              <span className="font-display text-xl font-bold uppercase">
                Ronda {round}
                {round === current && missing > 0 ? <span className="text-accent-ink"> · en curso</span> : null}
              </span>
              <span className="text-sm text-fg-muted tabular-nums">
                {recorded} de {games.length} cargados
              </span>
            </summary>
            <ul className="grid gap-3 px-4 pb-4 md:grid-cols-2">
              {games.map((game) => (
                <li key={game.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg/40 p-3">
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
          </details>
        )
      })}
    </section>
  )
}
