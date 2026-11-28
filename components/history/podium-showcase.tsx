import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { shortDate } from '@/lib/domain/format'
import { AMERICANO_PLACE_LABELS, medalCounts, PLACE_LABELS, type Place, type Podium } from '@/lib/domain/podiums'
import { cn } from '@/lib/cn'

// A medal: the place's number in a circle. Ink, not the club's color: 1° filled, 2° outlined in ink, 3° in the
// border's tone, so the three read apart without color.
export function Medal({ place, className }: { place: Place; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold tabular-nums',
        place === 1 ? 'bg-fg text-bg' : place === 2 ? 'border-2 border-fg text-fg' : 'border-2 border-border text-fg-muted',
        className,
      )}
    >
      {place}°
    </span>
  )
}

// The player's showcase: the medal count on top, then each podium, newest first.
export function PodiumShowcase({ podiums }: { podiums: Podium[] }) {
  if (podiums.length === 0) {
    return (
      <p className="text-fg-muted">
        Cuando subas a un podio en un campeonato o un americano, aparece acá.{' '}
        <Link href="/torneos" className="font-semibold text-accent-ink underline underline-offset-4">
          Ver torneos
        </Link>
      </p>
    )
  }
  const counts = medalCounts(podiums)
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
        {([1, 2, 3] as const).map((place) =>
          counts[place] > 0 ? (
            <span key={place}>
              <span className="font-semibold text-fg tabular-nums">{counts[place]}</span> {place === 1 ? (counts[1] === 1 ? 'título' : 'títulos') : place === 2 ? (counts[2] === 1 ? 'final' : 'finales') : (counts[3] === 1 ? 'tercer puesto' : 'terceros puestos')}
            </span>
          ) : null,
        )}
      </p>
      <ul aria-label="Tus podios" className="flex flex-col divide-y divide-border">
        {podiums.map((podium) => (
          <li key={podium.key}>
            <Link href={podium.href} className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-2 focus-visible:outline-accent">
              <Medal place={podium.place} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {(podium.kind === 'championship' ? PLACE_LABELS : AMERICANO_PLACE_LABELS)[podium.place]} · {podium.title}
                </span>
                <span className="block truncate text-sm text-fg-muted">{podium.detail}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-fg-muted">{shortDate(podium.date)}</span>
              <Icon name="chevron-right" className="size-5 shrink-0 text-fg-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
