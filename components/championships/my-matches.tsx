import Link from 'next/link'
import type { MyMatchItem } from '@/lib/domain/championship-views'

// Design: "Mis partidos": every category of the viewer, with court, time and result.
export function MyMatches({ matches }: { matches: MyMatchItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {matches.map((match) => (
        <li key={match.id}>
          <Link
            href={match.href}
            className="flex min-h-12 flex-col gap-0.5 rounded-xl border border-border bg-bg px-3 py-2 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="font-semibold">
              {match.day && match.time ? `${match.day} ${match.time}` : 'Sin horario todavía'}
              {match.court ? ` · ${match.court}` : ''}
            </span>
            <span className="text-sm">{[match.championshipName, match.categoryName, match.name].filter(Boolean).join(' · ')}</span>
            <span className="text-sm text-fg-muted">
              {[`vs ${match.rival}`, match.score, match.statusLabel].filter(Boolean).join(' · ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
