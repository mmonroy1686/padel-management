import { MatchCard } from '@/components/championships/match-card'
import type { MyMatchItem } from '@/lib/domain/championship-views'

// Design: "Mis partidos": every category of the viewer, each match as the public card with what it belongs to on top;
// the whole card opens its championship.
export function MyMatches({ matches }: { matches: MyMatchItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {matches.map((match) => (
        <li key={match.id}>
          <MatchCard
            match={match}
            href={match.href}
            topLine={[match.championshipName, match.categoryName, match.name].filter(Boolean).join(' · ')}
          />
        </li>
      ))}
    </ul>
  )
}
