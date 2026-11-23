import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { groupEvents, type EventGroup, type EventRow, type GroupTone, type GroupedEvents } from '@/lib/domain/event-groups'

const TONE_DOT: Record<GroupTone, string> = {
  live: 'bg-court',
  open: 'bg-accent',
  setup: 'bg-accent-ink',
  draft: 'bg-fg-muted',
  past: 'bg-border',
}

// Club panel: championships or americanos as cards, grouped by stage with what is live first; what is over, folded.
export function EventsBoard({ label, groups, rows, emptyText }: { label: string; groups: EventGroup[]; rows: EventRow[]; emptyText: string }) {
  const grouped = groupEvents(rows, groups)
  if (grouped.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">{emptyText}</p>
  }
  return (
    <div aria-label={label} role="group" className="flex flex-col gap-5">
      {grouped.map((group) =>
        group.folded ? (
          <details key={group.key} className="flex flex-col gap-3 [&[open]>summary]:mb-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-fg-muted">
              <Icon name="calendar" className="size-4" />
              {group.title} ({group.rows.length})
            </summary>
            <Cards group={group} />
          </details>
        ) : (
          <section key={group.key} aria-label={`${group.title}, ${group.rows.length}`} className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase">
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', TONE_DOT[group.tone])} />
              {group.title}
              <span className="font-sans text-sm font-semibold text-fg-muted tabular-nums">{group.rows.length}</span>
            </h3>
            <Cards group={group} />
          </section>
        ),
      )}
    </div>
  )
}

function Cards({ group }: { group: GroupedEvents }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {group.rows.map((row) => (
        <li key={row.id}>
          {/* The badge only says something when the group holds more than one status. */}
          <EventCard row={row} muted={group.folded === true} showStatus={group.statuses.length > 1} />
        </li>
      ))}
    </ul>
  )
}

function EventCard({ row, muted, showStatus }: { row: EventRow; muted: boolean; showStatus: boolean }) {
  return (
    <Link
      href={row.href}
      aria-label={`Gestionar ${row.name}`}
      className={cn(
        'flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        muted && 'bg-bg text-fg-muted',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-display text-xl font-bold uppercase leading-tight">{row.name}</span>
        {showStatus ? (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{row.statusLabel}</span>
        ) : null}
      </span>
      <span className="flex items-center gap-1.5 text-sm text-fg-muted">
        <Icon name="calendar" className="size-4" />
        {row.when}
      </span>
      <span className="flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
        <Icon name="users" className="size-4" />
        {row.people}
      </span>
      {row.nextStep ? (
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2 text-sm font-semibold text-accent-ink">
          {row.nextStep}
          <span aria-hidden="true">→</span>
        </span>
      ) : null}
    </Link>
  )
}
