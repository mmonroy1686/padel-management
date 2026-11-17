import { cn } from '@/lib/cn'
import { chargeLabel, playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'

const POSITIONS = [1, 2, 3, 4] as const
const SPOT = 'flex h-full min-h-20 flex-col justify-between gap-1 rounded-xl p-2 text-sm'

type SpotProps = {
  canCharge: boolean
  // The position whose confirmation is open: its button steps aside.
  charging: number | null
  onCharge: (position: number) => void
}

// A turn seen from above: two players on top, the net, two below. Same look as the match court (MatchCourt), but
// position and team do not matter here. Each spot says the name and whether the player paid; a share reception can
// charge is a button ("Cobrar $400"), and its confirmation shows under the court (BookingPlayers).
export function TurnCourt({ turn, ...spot }: SpotProps & { turn: Pick<TurnPlayers, 'players'> }) {
  return (
    <ul
      aria-label="Jugadores"
      className="relative grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-5 rounded-2xl bg-court p-2 text-on-court before:absolute before:inset-x-2 before:top-1/2 before:border-t-2 before:border-on-court before:content-['']"
    >
      {POSITIONS.map((position) => {
        const player = turn.players.find((candidate) => candidate.position === position)
        return (
          <li key={position}>
            {player ? (
              <PlayerSpot player={player} {...spot} />
            ) : (
              // An open match's empty spot: a dashed edge.
              <div className={cn(SPOT, 'justify-center border-2 border-dashed border-on-court')}>
                <b>Libre</b>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function PlayerSpot({ player, canCharge, charging, onCharge }: SpotProps & { player: PlayerShare }) {
  return (
    <div className={cn(SPOT, 'border border-on-court')}>
      <b className={cn('line-clamp-2 break-words', player.name === null && 'font-normal italic')}>{playerLabel(player)}</b>
      {player.state === 'paid' ? (
        <span className="text-xs font-semibold">Pagó ✓</span>
      ) : player.state === 'reported' ? (
        <span className="text-xs">Transferencia informada</span>
      ) : canCharge && charging !== player.position ? (
        <button
          type="button"
          aria-label={chargeLabel(player)}
          onClick={() => onCharge(player.position)}
          className="min-h-11 rounded-lg bg-accent px-3 font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-court"
        >
          Cobrar {formatPrice(player.due)}
        </button>
      ) : (
        <span className="text-xs">Debe {formatPrice(player.due)}</span>
      )}
    </div>
  )
}
