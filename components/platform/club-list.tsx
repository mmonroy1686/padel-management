import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import type { PlatformClub } from '@/lib/domain/platform'
import { activation, onlineShare, trialState } from '@/lib/domain/platform-trial'
import { localDateOf } from '@/lib/domain/time'
import { TrialBadge } from './trial-badge'

// One row per club, the whole row opens its page. A phone stacks each row; from a laptop the columns line up under
// one header, so the eye runs down a column (days left, bookings, the next step) across clubs.
const GRID = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center lg:gap-6'

export function ClubList({ clubs, now }: { clubs: PlatformClub[]; now: Date }) {
  return (
    <div className="flex flex-col">
      <div aria-hidden="true" className={`hidden border-b border-border pb-2 text-sm text-fg-muted ${GRID}`}>
        <span>Club</span>
        <span>Estado</span>
        <span className="text-right">Jugadores</span>
        <span className="text-right">Reservas 7 días</span>
        <span>Próximo paso</span>
      </div>
      <ul aria-label="Clubes" className="flex flex-col divide-y divide-border">
        {clubs.map((club) => {
          const trial = trialState(club, localDateOf(now, club.timezone))
          const progress = activation(club)
          const share = onlineShare(club)
          return (
            <li key={club.id}>
              <Link
                href={`/plataforma/clubes/${club.slug}`}
                className={`group flex flex-col gap-1.5 py-4 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:-mx-3 lg:rounded-lg lg:px-3 ${GRID}`}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{club.name}</span>
                    <span className="block truncate text-sm text-fg-muted">{club.slug}</span>
                  </span>
                  <Icon name="chevron-right" className="size-5 shrink-0 text-fg-muted lg:hidden" />
                </span>
                <span>
                  <TrialBadge text={trial.text} tone={trial.tone} />
                  {club.isSupport ? <span className="block text-sm text-fg-muted">Estás como soporte</span> : null}
                </span>
                <span className="text-sm tabular-nums lg:text-right lg:text-base">
                  {club.players}
                  <span className="text-fg-muted lg:hidden"> jugadores</span>
                </span>
                <span className="text-sm tabular-nums lg:text-right lg:text-base">
                  {club.bookingsLastWeek}
                  <span className="text-fg-muted lg:hidden"> reservas en 7 días</span>
                  {share === null ? null : <span className="text-fg-muted"> · {share}% online</span>}
                </span>
                <span className="text-sm">
                  {progress.next ? (
                    <>
                      <span className="font-semibold">{progress.next.label}</span>
                      <span className="text-fg-muted">
                        {' '}
                        · {progress.done} de {progress.total}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Icon name="check-circle" className="size-4" />
                      Todos los hitos
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
