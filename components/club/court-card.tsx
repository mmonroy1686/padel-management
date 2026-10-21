import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { timeLeft, type CourtItem, type CourtTurn } from '@/lib/domain/club-home'
import { timeIn } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { BookingPlayers, type PlayersActions } from './booking-players'
import type { PayMethods } from './charge-choice'

export type CourtListProps = {
  items: CourtItem[]
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  // En cancha ahora: each card shows how much is left.
  now?: Date
}

// The courts of one Inicio block: a card per booking or match, a line per block, tournament or day use.
export function CourtList({ items, timezone, methods, members, actions, now }: CourtListProps) {
  const hours = (item: CourtItem) => `${timeIn(item.startsAt, timezone)} a ${timeIn(item.endsAt, timezone)}`
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) =>
        item.kind === 'turn' ? (
          <li key={item.id}>
            <CourtTurnCard
              turn={item}
              hours={hours(item)}
              progress={now ? timeLeft(item, now) : undefined}
              methods={methods}
              members={members}
              actions={actions}
            />
          </li>
        ) : (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3 md:col-span-2"
          >
            {item.href ? (
              <Link href={item.href} className="font-semibold text-accent-ink underline">
                {item.courtName} · {item.label}
              </Link>
            ) : (
              <span className="font-semibold">
                {item.courtName} · {item.label}
              </span>
            )}
            <span className="text-sm text-fg-muted">{hours(item)}</span>
          </li>
        ),
      )}
    </ul>
  )
}

export function CourtTurnCard({
  turn,
  hours,
  progress,
  methods,
  members,
  actions,
}: {
  turn: CourtTurn
  hours: string
  progress?: { percentDone: number; text: string }
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
}) {
  return (
    <Card role="article" aria-label={`${turn.courtName}, ${hours}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold uppercase">{turn.courtName}</h3>
        <span className="text-sm text-fg-muted">
          {hours}
          {turn.isMatch ? ' · Partido abierto' : ''}
        </span>
      </div>
      {progress ? (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label={`Tiempo de juego en ${turn.courtName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentDone}
            aria-valuetext={progress.text}
            className="h-2 overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress.percentDone}%` }} />
          </div>
          <p className="text-sm text-fg-muted">{progress.text}</p>
        </div>
      ) : null}
      <BookingPlayers bookingId={turn.bookingId} turn={turn} methods={methods} members={members} actions={actions} />
    </Card>
  )
}
