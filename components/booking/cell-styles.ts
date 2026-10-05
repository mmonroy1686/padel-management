// One look per kind of cell, shared by the grid and its legend. Only token pairs that pass
// the contrast test in tests/unit/app/design-tokens.test.ts.
export const CELL_STYLES = {
  free: 'border-2 border-court bg-bg text-fg',
  mine: 'bg-court text-on-court',
  taken: 'bg-surface text-fg-muted',
  booking: 'bg-court text-on-court',
  recurring: 'bg-accent text-on-accent',
  block: 'border-2 border-dashed border-fg-muted bg-surface text-fg',
  tournament: 'border-2 border-accent bg-surface text-fg',
  day_use: 'border-2 border-dotted border-court-ink bg-surface text-fg',
  hold: 'border-2 border-dotted border-accent bg-surface text-fg',
  other: 'bg-surface text-fg',
} as const

export type CellStyle = keyof typeof CELL_STYLES
