import { cn } from '@/lib/cn'
import { CELL_STYLES, type CellStyle } from './cell-styles'

const ITEMS: Record<'player' | 'club', [CellStyle, string][]> = {
  player: [
    ['free', 'Libre'],
    ['mine', 'Tuya'],
    ['taken', 'Ocupada'],
  ],
  club: [
    ['booking', 'Reserva'],
    ['recurring', 'Turno fijo'],
    ['block', 'Bloqueo'],
  ],
}

export function Legend({ variant }: { variant: 'player' | 'club' }) {
  return (
    <ul aria-label="Referencias" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
      {ITEMS[variant].map(([style, label]) => (
        <li key={style} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-3 rounded-sm', CELL_STYLES[style])} />
          {label}
        </li>
      ))}
    </ul>
  )
}
