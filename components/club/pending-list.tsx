'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { playerLabel, type CourtTurn } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import { courtHours, CourtTurnCard, type CourtListProps } from './court-card'

// "Pendientes de cobro": a compact row per booking played today that still owes, ended more than 30 minutes ago.
// "Cobrar" opens the same court as En cancha ahora, right under its row, to charge each share or the rest.
export function PendingList({ turns, ...court }: Omit<CourtListProps, 'items'> & { turns: CourtTurn[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-border border-y border-border">
      {turns.map((turn) => {
        const hours = courtHours(turn, court.timezone)
        const isOpen = open === turn.id
        const holder = turn.isMatch || !turn.players[0] ? 'Partido abierto' : playerLabel(turn.players[0])
        return (
          <li key={turn.id} className="flex flex-col gap-2 py-2.5">
            {/* The name whole (no truncating): it is how reception finds the person in front of them. */}
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{holder}</span>
                <span className="block text-sm text-fg-muted">
                  {turn.courtName} · {hours} · <span className="font-semibold text-accent-ink">Debe {formatPrice(turn.restDue)}</span>
                </span>
              </span>
              <Button
                variant={isOpen ? 'ghost' : 'secondary'}
                aria-expanded={isOpen}
                aria-controls={`pendiente-${turn.id}`}
                aria-label={`${isOpen ? 'Cerrar' : 'Cobrar'} ${turn.courtName}, ${hours}`}
                onClick={() => setOpen(isOpen ? null : turn.id)}
              >
                {isOpen ? 'Cerrar' : 'Cobrar'}
              </Button>
            </div>
            {isOpen ? (
              <div id={`pendiente-${turn.id}`}>
                <CourtTurnCard turn={turn} {...court} chargesOpen />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
