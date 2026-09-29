'use client'

import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import { KIND_LABELS, type Court, type GridCell, type GridRow } from '@/lib/domain/grid'
import { CELL_STYLES } from './cell-styles'
import { PaymentBadge } from './payment-badge'

export type SlotGridProps = {
  courts: Court[]
  rows: GridRow[]
  variant: 'player' | 'club'
  onSelect: (cell: GridCell) => void
}

const CELL = 'flex min-h-14 w-full flex-col items-start justify-center rounded-xl px-3 py-2 text-left text-sm'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// One grid for both sides: players see free, taken and their own; the club sees who and how paid.
export function SlotGrid({ courts, rows, variant, onSelect }: SlotGridProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[18rem] border-separate border-spacing-1">
        <caption className="sr-only">Turnos por cancha</caption>
        <thead>
          <tr>
            <th scope="col" className="w-16">
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
          {rows.map((row) => (
            <tr key={row.slot.label}>
              <th scope="row" className={cn('pr-1 text-left font-display text-lg font-bold', row.past && 'opacity-50')}>
                {row.slot.label}
              </th>
              {row.cells.map((cell) => (
                <td key={cell.court.id} className="min-w-28">
                  {variant === 'player' ? (
                    <PlayerCell cell={cell} onSelect={onSelect} />
                  ) : (
                    <ClubCell cell={cell} onSelect={onSelect} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerCell({ cell, onSelect }: { cell: GridCell; onSelect: (cell: GridCell) => void }) {
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
        <span>Reserva</span>
      </div>
    )
  }
  const text = cell.state === 'taken' ? 'Ocupada' : cell.state === 'past' ? 'Ya pasó' : 'No disponible'
  return <div className={cn(CELL, CELL_STYLES.taken, cell.state === 'past' && 'opacity-50')}>{text}</div>
}

function ClubCell({ cell, onSelect }: { cell: GridCell; onSelect: (cell: GridCell) => void }) {
  const { court, slot, occupancy, booking } = cell
  if (occupancy) {
    const kindLabel = KIND_LABELS[occupancy.kind]
    const title = booking?.holderName ?? occupancy.note ?? kindLabel
    const style =
      occupancy.kind === 'block'
        ? CELL_STYLES.block
        : occupancy.kind === 'recurring'
          ? CELL_STYLES.recurring
          : occupancy.kind === 'booking'
            ? CELL_STYLES.booking
            : CELL_STYLES.other
    return (
      <button
        type="button"
        aria-label={`${court.name}, ${slot.label}: ${title}`}
        onClick={() => onSelect(cell)}
        className={cn(CELL, style, FOCUS, cell.state === 'past' && 'opacity-60')}
      >
        <b className="line-clamp-1">{title}</b>
        <span className="text-xs">
          {kindLabel}
          {booking ? `, ${booking.source === 'online' ? 'online' : 'en recepción'}` : ''}
        </span>
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
    </button>
  )
}
