import { cn } from '@/lib/cn'
import { timeIn } from '@/lib/domain/format'
import { scoreB } from '@/lib/domain/tournament-ranking'
import { currentRound, entryNames, gamesByRound, teamName, type Tournament, type TournamentGame } from '@/lib/domain/tournaments'

// Every round with its games as small scoreboards: who played whom and the score, the winners in
// bold. The round being played stays open and the others fold; the viewer's games stand out.
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
            <ul className="grid gap-2 px-4 pb-4 md:grid-cols-2">
              {games.map((game) => (
                <GameScore
                  key={game.id}
                  game={game}
                  teamA={teamName(game.teamA, names)}
                  teamB={teamName(game.teamB, names)}
                  pointsPerGame={tournament.pointsPerGame}
                  when={`${timeIn(game.startsAt, timezone)}, ${game.courtName}`}
                  mine={myEntryId !== null && [...game.teamA, ...game.teamB].includes(myEntryId)}
                />
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

function GameScore({
  game,
  teamA,
  teamB,
  pointsPerGame,
  when,
  mine,
}: {
  game: TournamentGame
  teamA: string
  teamB: string
  pointsPerGame: number
  when: string
  mine: boolean
}) {
  const a = game.scoreA
  const b = a === null ? null : scoreB(a, pointsPerGame)
  const teams = [
    { name: teamA, score: a, winner: a !== null && b !== null && a > b },
    { name: teamB, score: b, winner: a !== null && b !== null && b > a },
  ]
  return (
    <li className={cn('flex flex-col gap-2 rounded-xl border p-3', mine ? 'border-accent bg-bg' : 'border-border bg-bg/40')}>
      <p className="flex justify-between gap-2 text-xs text-fg-muted">
        <span>{when}</span>
        <span className="flex gap-2">
          {a === null ? <span>Por jugar</span> : null}
          {mine ? <span className="font-semibold text-accent-ink">Tu partido</span> : null}
        </span>
      </p>
      <div
        role="group"
        aria-label={a === null ? `${teamA} contra ${teamB}, por jugar` : `${teamA} ${a}, ${teamB} ${b}`}
        className="flex flex-col gap-1"
      >
        {teams.map((team) => (
          <div key={team.name} data-winner={String(team.winner)} className="flex items-center justify-between gap-3">
            <span className={cn('min-w-0 text-sm', team.winner ? 'font-bold text-fg' : 'text-fg-muted')}>{team.name}</span>
            <span
              className={cn(
                'grid h-9 min-w-11 shrink-0 place-items-center rounded-lg px-2 font-display text-2xl font-bold tabular-nums',
                team.winner ? 'bg-accent text-on-accent' : 'bg-surface text-fg',
              )}
            >
              {team.score ?? '–'}
            </span>
          </div>
        ))}
      </div>
    </li>
  )
}
