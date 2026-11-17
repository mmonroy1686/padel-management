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
    <ul className="flex flex-col gap-2">
      {turns.map((turn) => {
        const hours = courtHours(turn, court.timezone)
        const isOpen = open === turn.id
        const holder = turn.isMatch || !turn.players[0] ? 'Partido abierto' : playerLabel(turn.players[0])
        return (
          <li key={turn.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface px-4 py-2">
              <span className="font-semibold">{turn.courtName}</span>
              <span className="text-sm text-fg-muted">{hours}</span>
              <span className="min-w-0 flex-1 truncate">{holder}</span>
              <span className="font-semibold text-accent-ink">Debe {formatPrice(turn.restDue)}</span>
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
                <CourtTurnCard turn={turn} {...court} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
