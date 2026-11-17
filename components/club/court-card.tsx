import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import { timeLeft, turnLabel, type CourtEvent, type CourtItem, type CourtTurn } from '@/lib/domain/club-home'
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
  // Each card says, from it, how much is left, when it starts or how long ago it ended.
  now: Date
}

const EVENT_ICONS: Partial<Record<CourtEvent['occupancyKind'], IconName>> = {
  tournament: 'trophy',
  championship: 'trophy',
  day_use: 'ticket',
  block: 'cancel',
}

export function courtHours(item: Pick<CourtItem, 'startsAt' | 'endsAt'>, timezone: string): string {
  return `${timeIn(item.startsAt, timezone)} a ${timeIn(item.endsAt, timezone)}`
}

// The courts of one Inicio block: a court with its players per booking or match, a narrow card per block,
// tournament or day use.
export function CourtList({ items, timezone, methods, members, actions, now }: CourtListProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) =>
        item.kind === 'turn' ? (
          <li key={item.id}>
            <CourtTurnCard
              turn={item}
              now={now}
              timezone={timezone}
              methods={methods}
              members={members}
              actions={actions}
            />
          </li>
        ) : (
          <li key={item.id} className="md:col-span-2">
            <EventCard event={item} hours={courtHours(item, timezone)} />
          </li>
        ),
      )}
    </ul>
  )
}

function EventCard({ event, hours }: { event: CourtEvent; hours: string }) {
  const name = `${event.courtName} · ${event.label}`
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2">
      <Icon name={EVENT_ICONS[event.occupancyKind] ?? 'clock'} className="text-accent-ink" />
      {event.href ? (
        <Link href={event.href} className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline">
          {name}
        </Link>
      ) : (
        <span className="font-semibold">{name}</span>
      )}
      <span className="ml-auto text-sm text-fg-muted">{hours}</span>
    </div>
  )
}

export function CourtTurnCard({
  turn,
  now,
  timezone,
  methods,
  members,
  actions,
}: {
  turn: CourtTurn
  now: Date
  timezone: string
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
}) {
  const hours = courtHours(turn, timezone)
  const time = now.getTime()
  const playing = turn.startsAt.getTime() <= time && time < turn.endsAt.getTime()
  const ended = turn.endsAt.getTime() <= time
  const label = turnLabel(turn, now, timezone)
  const progress = playing ? timeLeft(turn, now) : null
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
      ) : ended ? (
        <p className="self-start rounded-full border border-accent px-3 py-1 text-sm font-semibold text-accent-ink">
          {label}
        </p>
      ) : (
        <p className="text-sm text-fg-muted">{label}</p>
      )}
      <BookingPlayers
        bookingId={turn.bookingId}
        turn={turn}
        methods={methods}
        members={members}
        actions={actions}
        layout="court"
      />
    </Card>
  )
}
