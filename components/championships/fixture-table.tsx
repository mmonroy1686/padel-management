'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/championships/match-line'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { MatchView } from '@/lib/domain/championship-views'

const COLUMNS: DataColumn[] = [
  { key: 'day', label: 'Día', sortable: true },
  { key: 'time', label: 'Hora', sortable: true },
  { key: 'court', label: 'Cancha', sortable: true },
  { key: 'category', label: 'Categoría', sortable: true },
  { key: 'match', label: 'Partido' },
  { key: 'status', label: 'Estado' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "el fixture en tabla (día, hora, cancha, categoría, partido)", with "Editar" (another court and time)
// and, before publishing, "Fijar". The matches without a place are listed apart (UnplacedList).
export function FixtureTable({
  matches,
  basePath,
  editable,
  canPin,
  pinAction,
}: {
  matches: MatchView[]
  basePath: string
  editable: boolean
  canPin: boolean
  pinAction: FormAction
}) {
  const placed = matches.filter((match) => match.startsAt !== null)
  const rows: DataRow[] = placed.map((match) => ({
    id: match.id,
    search: `${match.sideA} ${match.sideB} ${match.categoryName} ${match.name}`,
    sort: {
      day: match.startsAt?.getTime() ?? 0,
      time: match.startsAt?.getTime() ?? 0,
      court: match.court ?? '',
      category: match.categoryName,
    },
    filters: { category: match.categoryId, day: match.date ?? '' },
    cells: {
      day: match.day,
      time: match.time,
      court: match.court,
      category: match.categoryName,
      match: (
        <span>
          <span className="block font-semibold">{match.name}</span>
          <span className="block text-sm">{`${match.sideA} vs ${match.sideB}`}</span>
        </span>
      ),
      status: <FixtureStatus match={match} />,
      actions: (
        <div className="flex flex-wrap justify-end gap-2">
          {editable && match.status === 'scheduled' ? (
            <Link
              href={`${basePath}?partido=${match.id}`}
              aria-label={`Editar ${match.name}: ${match.sideA} vs ${match.sideB}`}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Editar
            </Link>
          ) : null}
          {canPin ? (
            <ActionForm action={pinAction} submitLabel={match.pinned ? 'Soltar' : 'Fijar'} pendingLabel="Guardando…" variant="ghost">
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="pinned" value={match.pinned ? 'false' : 'true'} />
            </ActionForm>
          ) : null}
        </div>
      ),
    },
  }))
  const categories = [...new Map(placed.map((match) => [match.categoryId, match.categoryName])).entries()]
  const days = [...new Map(placed.map((match) => [match.date ?? '', match.day ?? ''])).entries()]

  return (
    <DataTable
      caption="Fixture"
      columns={COLUMNS}
      rows={rows}
      filters={[
        { key: 'category', label: 'Categoría', options: categories.map(([value, label]) => ({ value, label })) },
        { key: 'day', label: 'Día', options: days.map(([value, label]) => ({ value, label })) },
      ]}
      searchLabel="Buscar pareja"
      searchPlaceholder="Nombre de un jugador"
      initialSort={{ key: 'day', dir: 'asc' }}
      pageSize={50}
      emptyText="Todavía no hay partidos programados."
    />
  )
}

// The state as its badge; the result as one small score per set (the side that won it in bold); "Fijado" apart.
function FixtureStatus({ match }: { match: MatchView }) {
  const sets = match.sets.filter((set) => !set.inProgress || set.a + set.b > 0)
  return (
    <span className="flex flex-col items-start gap-1.5">
      <StatusBadge match={match} large={false} />
      {sets.length > 0 ? (
        <span aria-label={`Resultado: ${sets.map((set) => `${set.a}-${set.b}`).join(' ')}`} className="flex flex-wrap gap-1">
          {sets.map((set, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'rounded-md px-1.5 py-0.5 font-display text-base tabular-nums ring-1',
                set.inProgress ? 'ring-accent' : 'ring-border',
              )}
            >
              <b className={cn(set.a > set.b ? 'text-fg' : 'font-normal text-fg-muted')}>{set.a}</b>
              <span className="text-fg-muted">-</span>
              <b className={cn(set.b > set.a ? 'text-fg' : 'font-normal text-fg-muted')}>{set.b}</b>
            </span>
          ))}
        </span>
      ) : null}
      {match.pinned ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
          <Icon name="pin" className="size-3.5" />
          Fijado
        </span>
      ) : null}
    </span>
  )
}
