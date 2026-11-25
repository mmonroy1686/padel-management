'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { playerLabel, timeLeft, turnLabel, type CourtTurn } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import { courtHours, CourtTurnCard, EventRow, type CourtListProps } from './court-card'

// A block of the Inicio as one compact row per turn: who, which court and when, how it goes (time left, when it
// starts, when it ended) and what it owes. One button per row: «Cobrar» when it owes, «Ver» otherwise. It opens the
// court of that turn right under its row (players, each share, Completar jugadores). Blocks, tournaments and day use
// are a quiet row with their icon.
export function TurnRows({ items, ...court }: CourtListProps) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) =>
        item.kind === 'turn' ? (
          <TurnRow
            key={item.id}
            turn={item}
            open={open === item.id}
            onToggle={() => setOpen(open === item.id ? null : item.id)}
            {...court}
          />
        ) : (
          <li key={item.id}>
            <EventRow event={item} hours={courtHours(item, court.timezone)} />
          </li>
        ),
      )}
    </ul>
  )
}

function TurnRow({
  turn,
  open,
  onToggle,
  ...court
}: Omit<CourtListProps, 'items'> & { turn: CourtTurn; open: boolean; onToggle: () => void }) {
  const hours = courtHours(turn, court.timezone)
  const time = court.now.getTime()
  const playing = turn.startsAt.getTime() <= time && time < turn.endsAt.getTime()
  const owes = turn.restDue > 0 && (court.methods.cash || court.methods.transfer)
  const holder = turn.isMatch || !turn.players[0] ? 'Partido abierto' : playerLabel(turn.players[0])
  const verb = owes ? 'Cobrar' : 'Ver'
  const progress = playing ? timeLeft(turn, court.now) : null
  return (
    <li className="flex flex-col gap-2 py-2.5">
      {/* The name whole (no truncating): it is how reception finds the person in front of them. */}
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{holder}</span>
          <span className="block text-sm text-fg-muted">
            {turn.courtName} · {hours}
          </span>
          <span className="block text-sm">
            <span className={cn(turn.endsAt.getTime() <= time ? 'font-semibold' : 'text-fg-muted')}>
              {turnLabel(turn, court.now, court.timezone)}
            </span>
            {turn.restDue > 0 ? (
              <>
                {' · '}
                <span className="font-semibold text-accent-ink">Debe {formatPrice(turn.restDue)}</span>
              </>
            ) : null}
          </span>
          {progress ? (
            <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-bg">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${progress.percentDone}%` }} />
            </span>
          ) : null}
        </span>
        <Button
          variant={open ? 'ghost' : owes ? 'secondary' : 'ghost'}
          aria-expanded={open}
          aria-controls={`turno-${turn.id}`}
          aria-label={`${open ? 'Cerrar' : verb} ${turn.courtName}, ${hours}`}
          onClick={onToggle}
        >
          {open ? 'Cerrar' : verb}
        </Button>
      </div>
      {open ? (
        <div id={`turno-${turn.id}`}>
          <CourtTurnCard turn={turn} {...court} chargesOpen={owes} />
        </div>
      ) : null}
    </li>
  )
}
