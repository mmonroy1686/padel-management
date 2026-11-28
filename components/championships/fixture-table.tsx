'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
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

// Design: "el fixture en tabla (día, hora, cancha, categoría, partido)", with "Mover" (another court and time)
// and, before publishing, "Fijar" / "Soltar", side by side and the same size; each names its match for screen
// readers. The matches without a place are listed apart (UnplacedList).
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
  const byId = new Map(placed.map((match) => [match.id, match]))
  const actionsOf = (match: MatchView) =>
    (editable && match.status === 'scheduled') || canPin ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editable && match.status === 'scheduled' ? (
            <Link
              href={`${basePath}?partido=${match.id}`}
              aria-label={`Mover ${match.name}: ${match.sideA} vs ${match.sideB}`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Icon name="move" className="size-4" />
              Mover
            </Link>
          ) : null}
          {canPin ? (
            <ActionForm
              action={pinAction}
              submitLabel={match.pinned ? 'Soltar' : 'Fijar'}
              accessibleLabel={`${match.pinned ? 'Soltar' : 'Fijar'} ${match.name}: ${match.sideA} vs ${match.sideB}`}
              pendingLabel="Guardando…"
              variant="secondary"
              size="sm"
              icon={<Icon name="pin" className="size-4" />}
            >
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="pinned" value={match.pinned ? 'false' : 'true'} />
            </ActionForm>
          ) : null}
        </div>
    ) : null
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
      time: <span className="font-display text-lg tabular-nums">{match.time}</span>,
      court: match.court ? <CourtChip name={match.court} /> : null,
      category: <span className="font-semibold text-accent-ink">{match.categoryName}</span>,
      match: (
        <span>
          <span className="block text-xs font-bold uppercase tracking-wide text-fg-muted">{match.name}</span>
          <Pairs match={match} inline />
        </span>
      ),
      status: <FixtureStatus match={match} />,
      actions: actionsOf(match),
    },
  }))
  const categories = [...new Map(placed.map((match) => [match.categoryId, match.categoryName])).entries()]
  const days = [...new Map(placed.map((match) => [match.date ?? '', match.day ?? ''])).entries()]

  return (
    <>
      {canPin ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
          Fijá los partidos que ya acordaste: si volvés a programar, quedan en su cancha y horario.
        </p>
      ) : null}
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
      renderPhone={(row) => {
        const match = byId.get(row.id)
        return match ? <FixtureCard match={match} actions={actionsOf(match)} /> : null
      }}
      />
    </>
  )
}

// The court as a chip in the club's support color: the courts are what reception scans for.
function CourtChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-court px-2.5 py-0.5 text-xs font-bold text-on-court">
      {name}
    </span>
  )
}

// The two pairs, the winner in bold with the court's ink once there is one.
function Pairs({ match, inline = false }: { match: MatchView; inline?: boolean }) {
  const side = (name: string, which: 'a' | 'b') => (
    <span className={cn(match.winner === which && 'font-bold text-court-ink', match.winner && match.winner !== which && 'text-fg-muted')}>
      {name}
    </span>
  )
  if (inline) {
    return (
      <span className="block text-sm">
        {side(match.sideA, 'a')} <span className="text-fg-muted">vs</span> {side(match.sideB, 'b')}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-0.5 font-semibold">
      {side(match.sideA, 'a')}
      <span aria-hidden="true" className="text-xs font-bold uppercase tracking-wide text-fg-muted">vs</span>
      <span className="sr-only">contra</span>
      {side(match.sideB, 'b')}
    </span>
  )
}

// A phone shows each match as its own card: the time and the court first (what reception looks for), then the
// category and round, the pairs, the state and the actions. Playing now lights up in the club's color.
function FixtureCard({ match, actions }: { match: MatchView; actions: ReactNode }) {
  const playing = match.status === 'playing'
  const done = match.status === 'finished' || match.status === 'walkover'
  return (
    <article
      aria-label={`${match.name}, ${match.categoryName}: ${match.sideA} vs ${match.sideB}`}
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface',
        playing ? 'border-accent ring-1 ring-accent' : 'border-border',
        done && 'opacity-80',
      )}
    >
      <header className={cn('flex items-center gap-3 px-4 py-3', playing ? 'bg-accent/15' : 'bg-court/10')}>
        <span className="font-display text-3xl leading-none tabular-nums">{match.time}</span>
        <span className="text-sm capitalize text-fg-muted">{match.day}</span>
        {match.court ? <span className="ml-auto"><CourtChip name={match.court} /></span> : null}
      </header>
      <div className="flex flex-col gap-3 p-4">
        <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase tracking-wide">
          <span className="text-accent-ink">{match.categoryName}</span>
          <span aria-hidden="true" className="text-fg-muted">·</span>
          <span className="text-fg-muted">{match.name}</span>
        </p>
        <Pairs match={match} />
        <FixtureStatus match={match} row />
        {actions ? <div className="border-t border-border pt-3 [&>div]:justify-start">{actions}</div> : null}
      </div>
    </article>
  )
}

// The state as its badge; the result as one small score per set (the side that won it in bold); "Fijado" apart.
function FixtureStatus({ match, row = false }: { match: MatchView; row?: boolean }) {
  const sets = match.sets.filter((set) => !set.inProgress || set.a + set.b > 0)
  return (
    <span className={cn('flex items-start gap-1.5', row ? 'flex-wrap items-center gap-2' : 'flex-col')}>
      <StatusBadge match={match} large={false} />
      {sets.length > 0 ? (
        <span aria-label={`Resultado: ${sets.map((set) => `${set.a}-${set.b}`).join(' ')}`} className="flex flex-wrap gap-1">
          {sets.map((set, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'rounded-md px-1.5 py-0.5 font-display text-base tabular-nums ring-1',
                set.inProgress ? 'ring-accent' : 'ring-court/40',
              )}
            >
              <b className={cn(set.a > set.b ? 'text-court-ink' : 'font-normal text-fg-muted')}>{set.a}</b>
              <span className="text-fg-muted">-</span>
              <b className={cn(set.b > set.a ? 'text-court-ink' : 'font-normal text-fg-muted')}>{set.b}</b>
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
