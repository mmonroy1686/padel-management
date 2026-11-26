'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { inputClasses } from '@/components/ui/field'
import { normalizeText } from '@/lib/domain/members'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { playerLabel, timeLeft, turnLabel, type CourtTurn } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import { courtHours, CourtTurnCard, EventRow, type CourtListProps } from './court-card'

// A block of the Inicio as one compact row per turn: who, which court and when, how it goes (time left, when it
// starts, when it ended) and what it owes. One button per row: «Cobrar» when it owes, «Ver» otherwise. It opens the
// court of that turn right under its row (players, each share, Completar jugadores). Blocks, tournaments and day use
// are a quiet row with their icon.
export function TurnRows({ items: all, ...court }: CourtListProps) {
  const [open, setOpen] = useState<string | null>(null)
  const query = normalizeText(useContext(SearchContext)?.query ?? '').trim()
  const items = query ? all.filter((item) => normalizeText(searchTextOf(item)).includes(query)) : all
  if (query && items.length === 0) return <p className="text-sm text-fg-muted">Nadie coincide acá.</p>
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
            // Ink, not amber: time going by is information; amber is for what is owed.
            <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-border">
              <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${progress.percentDone}%` }} />
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

// Who a turn is for, in every way reception may say it: the players' names, the court, an event's label.
function searchTextOf(item: CourtListProps['items'][number]): string {
  if (item.kind !== 'turn') return `${item.courtName} ${item.label}`
  return [item.courtName, ...item.players.map((player) => player.name ?? '')].join(' ')
}

const SearchContext = createContext<{ query: string; setQuery: (query: string) => void } | null>(null)

// The Inicio's search: one box that narrows En cancha ahora, Próximos and Pendientes de cobro at once.
export function TurnSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>
}

export function TurnSearchBox() {
  const search = useContext(SearchContext)
  if (!search) return null
  return (
    <input
      type="search"
      aria-label="Buscar a quién cobrar en Inicio"
      placeholder="Cobrar a… (nombre o cancha)"
      value={search.query}
      onChange={(event) => search.setQuery(event.target.value)}
      className={cn(inputClasses, 'min-h-12 text-lg')}
    />
  )
}
