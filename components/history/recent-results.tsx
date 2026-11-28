import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { PageSection } from '@/components/ui/page-section'
import { hasFourPlayers, resultView, type PlayedBooking } from '@/lib/domain/booking-result'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { localDateOf, type LocalDate } from '@/lib/domain/time'
import { cn } from '@/lib/cn'

const SHOWN = 3

// Inicio → "Tus últimos partidos": the run of the last results as dots, then the last played bookings, each with its
// stamp (won in the support color with a trophy, lost in ink), the sets as boxes and who played. Without a result, a
// way to load it. The club's color stays on "Reservar cancha": wins take the support color.
export function RecentResults({ played, timezone, today }: { played: PlayedBooking[]; timezone: string; today: LocalDate }) {
  if (played.length === 0) return null
  const withResult = played.filter((booking) => booking.result !== null)
  const run = withResult.slice(0, 5).map((booking) => resultView(booking.players, booking.result!).won)
  const won = run.filter(Boolean).length

  return (
    <PageSection id="ultimos-partidos" title="Tus últimos partidos" more={{ href: '/perfil/partidos', label: 'Ver todos' }}>
      {run.length > 0 ? (
        <div className="flex items-center gap-3">
          <ol aria-label="Últimos resultados, del más nuevo al más viejo" className="flex items-center gap-1.5">
            {run.map((win, index) => (
              <li
                key={index}
                className={cn(
                  'grid size-7 place-items-center rounded-full text-xs font-bold',
                  win ? 'bg-court text-on-court' : 'border-2 border-border text-fg-muted',
                )}
              >
                {win ? 'G' : 'P'}
                <span className="sr-only">{win ? 'ganado' : 'perdido'}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-fg-muted">
            Ganaste <span className="font-semibold text-fg tabular-nums">{won}</span> de los últimos {run.length}
          </p>
        </div>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
        {played.slice(0, SHOWN).map((booking) => (
          <li key={booking.bookingId} className="min-w-0">
            <ResultCard booking={booking} timezone={timezone} today={today} />
          </li>
        ))}
      </ul>
    </PageSection>
  )
}

function ResultCard({ booking, timezone, today }: { booking: PlayedBooking; timezone: string; today: LocalDate }) {
  const view = booking.result ? resultView(booking.players, booking.result) : null
  const when = `${dayLabel(localDateOf(booking.startsAt, timezone), today)} ${timeIn(booking.startsAt, timezone)} · ${booking.courtName}`
  const others = booking.players.filter((player) => !player.isMe).map((player) => player.name)

  return (
    <article
      className={cn(
        'flex min-w-0 items-center gap-4 rounded-2xl border bg-surface p-4',
        view?.won ? 'border-court-ink' : 'border-border',
      )}
    >
      <Stamp state={view ? (view.won ? 'won' : 'lost') : 'none'} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn('font-semibold', view?.won && 'text-court-ink')}>
            {view ? (view.won ? 'Ganaste' : 'Perdiste') : 'Sin resultado'}
          </span>
          <span className="text-sm text-fg-muted">{when}</span>
        </p>
        {view ? (
          <>
            <Sets sets={view.sets} />
            <p className="text-sm text-fg-muted">
              {view.partners.length > 0 ? `Con ${view.partners.join(' y ')} · ` : ''}vs {view.rivals.join(' y ')}
            </p>
          </>
        ) : (
          <>
            {others.length > 0 ? <p className="truncate text-sm text-fg-muted">Con {others.join(', ')}</p> : null}
            {hasFourPlayers(booking.players) ? (
              <Link href="/perfil/partidos" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-court-ink">
                Cargar resultado
                <Icon name="chevron-right" className="size-4" />
              </Link>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}

// The result at a glance: a trophy on the support color, a cross in ink, a clock while nobody loaded it.
function Stamp({ state }: { state: 'won' | 'lost' | 'none' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-12 shrink-0 place-items-center rounded-full',
        state === 'won' ? 'bg-court text-on-court' : state === 'lost' ? 'bg-bg text-fg ring-1 ring-border' : 'bg-bg text-fg-muted ring-1 ring-border',
      )}
    >
      <Icon name={state === 'won' ? 'trophy' : state === 'lost' ? 'x' : 'clock'} className="size-6" />
    </span>
  )
}

// "6-4 3-6 7-5" as boxes, the viewer's games first: the sets they won filled.
function Sets({ sets }: { sets: string }) {
  return (
    <span className="flex flex-wrap gap-1.5" aria-label={`Sets: ${sets}`}>
      {sets.split(' ').map((set, index) => {
        const [ours, theirs] = set.split('-').map(Number)
        const won = ours > theirs
        return (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              'inline-flex h-8 min-w-12 items-center justify-center rounded-lg px-2 font-display text-lg font-bold tabular-nums',
              won ? 'bg-court text-on-court' : 'bg-bg text-fg-muted ring-1 ring-border',
            )}
          >
            {ours}-{theirs}
          </span>
        )
      })}
    </span>
  )
}
