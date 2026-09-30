import { cn } from '@/lib/cn'
import { filledCount, SLOT_SIDE_LABELS, SLOT_SIDE_WORDS, type Match, type MatchSlot } from '@/lib/domain/matches'
import { firstName } from '@/lib/domain/profile'

export type MatchCourtProps = {
  match: Pick<Match, 'slots'>
  viewerId: string
  joinable?: number[]
  onJoin?: (position: number) => void
  compact?: boolean
}

const SPOT = 'flex min-h-14 flex-col items-start justify-center rounded-xl px-2 py-1 text-left text-sm'

// The court seen from above: team A on top (spots 1 and 2), the net, team B below (3 and 4).
export function MatchCourt({ match, viewerId, joinable = [], onJoin, compact = false }: MatchCourtProps) {
  const spot = (position: number) => {
    const slot = match.slots.find((candidate) => candidate.position === position)
    return slot ? (
      <Spot slot={slot} viewerId={viewerId} onJoin={onJoin && joinable.includes(position) ? onJoin : undefined} />
    ) : null
  }
  return (
    <div
      role="group"
      aria-label={`Cancha con ${filledCount(match)} de 4 jugadores`}
      className={cn('flex flex-col gap-1 rounded-2xl bg-court p-2 text-on-court', compact ? 'w-40 shrink-0' : 'w-full')}
    >
      {compact ? null : <p className="text-xs font-semibold uppercase">Pareja 1</p>}
      <div className="grid grid-cols-2 gap-1">
        {spot(1)}
        {spot(2)}
      </div>
      <div aria-hidden="true" className="border-t-2 border-on-court" />
      <div className="grid grid-cols-2 gap-1">
        {spot(3)}
        {spot(4)}
      </div>
      {compact ? null : <p className="text-xs font-semibold uppercase">Pareja 2</p>}
    </div>
  )
}

function Spot({ slot, viewerId, onJoin }: { slot: MatchSlot; viewerId: string; onJoin?: (position: number) => void }) {
  const side = SLOT_SIDE_LABELS[slot.side]
  if (slot.playerId) {
    const name = slot.playerId === viewerId ? 'Vos' : firstName(slot.playerName ?? 'Jugador')
    return (
      <div className={cn(SPOT, 'border border-on-court')}>
        <b className="line-clamp-1">{name}</b>
        <span className="text-xs">{side}</span>
      </div>
    )
  }
  if (onJoin) {
    return (
      <button
        type="button"
        aria-label={`Sumarme de ${SLOT_SIDE_WORDS[slot.side]}`}
        onClick={() => onJoin(slot.position)}
        className={cn(SPOT, 'bg-accent text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent')}
      >
        <b>Sumarme</b>
        <span className="text-xs">{side}</span>
      </button>
    )
  }
  return (
    <div className={cn(SPOT, 'border border-dashed border-on-court')}>
      <b>Falta</b>
      <span className="text-xs">{side}</span>
    </div>
  )
}
