'use client'

import Link from 'next/link'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { blockEnd, continuesAbove, KIND_LABELS, rowsCovered, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import { CELL_STYLES } from './cell-styles'
import { PaymentBadge } from './payment-badge'

export type SlotGridProps = {
  courts: Court[]
  rows: GridRow[]
  variant: 'player' | 'club'
  onSelect: (cell: GridCell) => void
  // Players: a taken slot still ahead offers "Avisame si se libera".
  onWait?: (cell: GridCell) => void
}

const CELL = 'flex h-full min-h-14 w-full flex-col items-start justify-center rounded-xl px-2.5 py-2 text-left text-sm md:min-h-16 md:px-3'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// One grid for both sides: players see free, taken and their own; the club sees who and how paid.
export function SlotGrid({ courts, rows, variant, onSelect, onWait }: SlotGridProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[18rem] border-separate border-spacing-1">
        <caption className="sr-only">Turnos por cancha</caption>
        <thead>
          <tr>
            <th scope="col" className={variant === 'player' ? 'w-12' : 'w-16'}>
              <span className="sr-only">Hora</span>
            </th>
            {courts.map((court) => (
              <th key={court.id} scope="col" className="text-left text-sm font-semibold">
                {court.name}
                <span className="block text-xs font-normal text-fg-muted">
                  {court.isCovered ? 'Techada' : 'Al aire libre'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.slot.label}>
              <th
                scope="row"
                className={cn('pr-1 text-left font-display font-bold', variant === 'player' ? 'text-base' : 'text-lg', row.past && 'opacity-50')}
              >
                {row.slot.label}
              </th>
              {row.cells.map((cell, courtIndex) =>
                // An occupancy over several slots is one block: its first row spans the rest.
                continuesAbove(rows, rowIndex, courtIndex) ? null : (
                  // Players: the columns share the width so three courts fit on a phone; the club's longer
                  // cells keep their width and scroll. h-px lets the cell's block fill a spanned height.
                  <td
                    key={cell.court.id}
                    rowSpan={rowsCovered(rows, rowIndex, courtIndex)}
                    className={cn('h-px', variant === 'player' ? 'min-w-0' : 'min-w-28')}
                  >
                    {variant === 'player' ? (
                      <PlayerCell cell={cell} past={row.past} onSelect={onSelect} onWait={onWait} />
                    ) : (
                      <ClubCell cell={cell} until={blockEnd(rows, rowIndex, courtIndex)} onSelect={onSelect} />
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerCell({
  cell,
  past,
  onSelect,
  onWait,
}: {
  cell: GridCell
  past: boolean
  onSelect: (cell: GridCell) => void
  onWait?: (cell: GridCell) => void
}) {
  if (cell.state === 'free' && cell.formingMatch) {
    const missing = 4 - cell.formingMatch.filled
    const text = missing === 1 ? 'Falta 1' : `Faltan ${missing}`
    return (
      <Link
        href={`/partidos/${cell.formingMatch.id}`}
        aria-label={`Partido armándose en ${cell.court.name} a las ${cell.slot.label}: ${text.toLowerCase()}`}
        className={cn(CELL, 'border-2 border-dashed border-accent bg-bg text-fg', FOCUS)}
      >
        <b>{text}</b>
        <span>Partido abierto</span>
      </Link>
    )
  }
  if (cell.state === 'free' && cell.price !== null) {
    const price = formatPrice(cell.price)
    return (
      <button
        type="button"
        aria-label={`Reservar ${cell.court.name} a las ${cell.slot.label}, ${price}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, CELL_STYLES.free, FOCUS, 'hover:bg-surface')}
      >
        <b className="font-display text-lg">{price}</b>
        <span>Libre</span>
      </button>
    )
  }
  if (cell.state === 'mine') {
    return (
      <div className={cn(CELL, CELL_STYLES.mine)}>
        <b>Tuya</b>
        <span>{cell.booking?.matchId ? 'Partido' : 'Reserva'}</span>
      </div>
    )
  }
  if (cell.state === 'taken' && !past && onWait) {
    return (
      <button
        type="button"
        aria-label={`Avisame si se libera ${cell.court.name} a las ${cell.slot.label}`}
        onClick={() => onWait(cell)}
        className={cn(CELL, CELL_STYLES.taken, FOCUS, 'hover:text-fg')}
      >
        <span>Ocupada</span>
        <span className="text-xs font-semibold text-accent-ink">Avisame</span>
      </button>
    )
  }
  const text = cell.state === 'taken' ? 'Ocupada' : cell.state === 'past' ? 'Ya pasó' : 'No disponible'
  return <div className={cn(CELL, CELL_STYLES.taken, cell.state === 'past' && 'opacity-50')}>{text}</div>
}

function ClubCell({
  cell,
  until,
  onSelect,
}: {
  cell: GridCell
  until: string | null
  onSelect: (cell: GridCell) => void
}) {
  const { court, slot, occupancy, booking } = cell
  if (occupancy) {
    const kindLabel = KIND_LABELS[occupancy.kind]
    const title = booking?.holderName ?? occupancy.note ?? kindLabel
    const style =
      occupancy.kind === 'block'
        ? CELL_STYLES.block
        : occupancy.kind === 'tournament'
          ? CELL_STYLES.tournament
          : occupancy.kind === 'day_use'
            ? CELL_STYLES.day_use
            : occupancy.kind === 'recurring'
              ? CELL_STYLES.recurring
              : occupancy.kind === 'booking' || occupancy.kind === 'match'
                ? CELL_STYLES.booking
                : CELL_STYLES.other
    return (
      <button
        type="button"
        aria-label={`${court.name}, ${slot.label}${until ? ` a ${until}` : ''}: ${title}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, style, FOCUS, cell.state === 'past' && 'opacity-60')}
      >
        <b className="line-clamp-1">{title}</b>
        <span className="text-xs">
          {kindLabel}
          {booking ? `, ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''}
        </span>
        {until ? <span className="text-xs tabular-nums">Hasta las {until}</span> : null}
        {booking ? <PaymentBadge state={booking.paymentState} className="mt-1" /> : null}
        {cell.offGrid ? <span className="text-xs">Fuera de la grilla</span> : null}
      </button>
    )
  }
  if (cell.state === 'past') return <div className={cn(CELL, CELL_STYLES.taken, 'opacity-50')}>Sin uso</div>
  return (
    <button
      type="button"
      aria-label={`Cargar ${court.name}, ${slot.label}`}
      onClick={() => onSelect(cell)}
      className={cn(CELL, FOCUS, 'border border-dashed border-border text-fg-muted hover:border-accent')}
    >
      <span>+ Cargar</span>
      {cell.price === null ? <span className="text-xs">Sin precio</span> : null}
      {cell.formingMatch ? <span className="text-xs">Armándose {cell.formingMatch.filled}/4 · no bloquea</span> : null}
    </button>
  )
}
