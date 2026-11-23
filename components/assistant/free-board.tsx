'use client'

import Link from 'next/link'
import type { AssistantBoard, BoardCell, BoardSlot } from '@/lib/domain/assistant-board'
import { demandText } from '@/lib/domain/slot-planner'

const CHIP = 'flex min-h-11 w-full items-center rounded-xl px-2.5 py-2 sm:px-3'

function Cell({ cell, courtName, label, onPick }: { cell: BoardCell; courtName: string; label: string; onPick: (slot: BoardSlot) => void }) {
  if (cell.state === 'taken') {
    return (
      <span className={`${CHIP} text-fg-muted`}>
        <s>{label}</s>
        <span className="sr-only"> Ocupado</span>
      </span>
    )
  }
  if (cell.state === 'forming') {
    return (
      <Link href={`/partidos/${cell.matchId}`} className={`${CHIP} border border-border bg-surface font-semibold text-accent-ink`}>
        {label} · Armándose {cell.filled}/4
      </Link>
    )
  }
  if (cell.state === 'none') return null
  const { slot } = cell
  if (!slot) {
    return (
      <span className={`${CHIP} border border-border`}>
        <span>{label}</span>
        <span className="sr-only">, libre</span>
      </span>
    )
  }
  const demand = slot.proposal ? demandText(slot.proposal) : null
  return (
    <button
      type="button"
      onClick={() => onPick(slot)}
      aria-label={`Armar partido · ${courtName} · ${label}${demand ? ` · ${demand}` : ''}`}
      className={`${CHIP} flex-col items-start border-2 border-accent bg-surface text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <span className="font-semibold">{label}</span>
      {demand ? <span className="text-sm text-fg-muted">{demand}</span> : null}
    </button>
  )
}

// Courts in columns, the times still to come in chips: a free one opens "Armar partido", a taken one is struck out
// and says so, a forming match leads to it.
export function FreeBoard({ board, onPick }: { board: AssistantBoard; onPick: (slot: BoardSlot) => void }) {
  const anyFree = board.rows.some((row) => row.cells.some((cell) => cell.state === 'free'))
  return (
    <section aria-labelledby="libres" className="flex flex-col gap-3">
      <h2 id="libres" className="font-display text-2xl font-bold uppercase">
        Tablero de libres
      </h2>
      {anyFree ? null : <p className="rounded-xl border border-border p-4 text-fg-muted">No quedan turnos libres este día.</p>}
      {board.rows.length > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${board.courts.length}, minmax(6rem, 1fr))` }}>
            {board.courts.map((court, index) => (
              <section key={court.id} aria-label={court.name} className="flex flex-col gap-2">
                <h3 className="font-semibold">{court.name}</h3>
                <ul className="flex flex-col gap-2">
                  {board.rows.map((row) => {
                    const cell = row.cells[index]
                    if (!cell || cell.state === 'none') return null
                    return (
                      <li key={row.label}>
                        <Cell cell={cell} courtName={court.name} label={row.label} onPick={onPick} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
