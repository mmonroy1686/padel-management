'use client'

import { useCallback, useState } from 'react'
import { Legend } from '@/components/booking/legend'
import { SlotGrid } from '@/components/booking/slot-grid'
import { LoadSheet } from '@/components/club/load-sheet'
import { OccupancyDetailSheet, type DetailActions } from '@/components/club/occupancy-detail-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { timeIn } from '@/lib/domain/format'
import { KIND_LABELS, type DayGrid, type GridCell } from '@/lib/domain/grid'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

export function ClubBoard({
  date,
  dayText,
  timezone,
  grid,
  members,
  acceptsCash,
  loadAction,
  detailActions,
}: {
  date: LocalDate
  dayText: string
  timezone: string
  grid: DayGrid
  members: MemberOption[]
  acceptsCash: boolean
  loadAction: FormAction
  detailActions: DetailActions
}) {
  const [selected, setSelected] = useState<GridCell | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSelected(null), [])
  const done = useCallback((message: string) => {
    setSelected(null)
    setNotice(message)
  }, [])
  const courtName = (courtId: string) => grid.courts.find((court) => court.id === courtId)?.name ?? 'Cancha'

  return (
    <section aria-labelledby="grilla" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="grilla" className="font-display text-2xl font-bold uppercase">
          Grilla de canchas
        </h2>
        <Legend variant="club" />
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <SlotGrid
        courts={grid.courts}
        rows={grid.rows}
        variant="club"
        onSelect={(cell) => {
          setNotice(null)
          setSelected(cell)
        }}
      />
      <p className="text-sm text-fg-muted">Tocá una cancha libre para cargar una reserva, o una ocupada para ver el detalle.</p>
      {grid.outside.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">Fuera de la grilla</h3>
          <ul className="text-sm">
            {grid.outside.map((o) => (
              <li key={o.id}>
                {courtName(o.courtId)}, {timeIn(o.startsAt, timezone)} a {timeIn(o.endsAt, timezone)}:{' '}
                {o.note ?? KIND_LABELS[o.kind]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selected && !selected.occupancy ? (
        <LoadSheet
          cell={selected}
          date={date}
          dayText={dayText}
          rows={grid.rows}
          members={members}
          action={loadAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {selected?.occupancy ? (
        <OccupancyDetailSheet
          cell={selected}
          occupancy={selected.occupancy}
          date={date}
          dayText={dayText}
          timezone={timezone}
          acceptsCash={acceptsCash}
          actions={detailActions}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </section>
  )
}
