import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { ranking } from '@/lib/domain/tournament-ranking'
import { courtsText, formatText, spotsLabel, type EntryStatus, type Tournament } from '@/lib/domain/tournaments'

// Design: "Lista /torneos". Signing up goes through the detail page, which explains the rules first.
export function TournamentCard({ tournament, whenText, status }: { tournament: Tournament; whenText: string; status: EntryStatus }) {
  const href = `/torneos/${tournament.id}`
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
  // Once results are in, the card says who won or who leads.
  const leader = tournament.status === 'finished' || tournament.status === 'in_progress'
    ? ranking(tournament.entries, tournament.games, tournament.pointsPerGame).find((row) => row.played > 0)
    : undefined
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{whenText}</p>
          <p className="font-semibold">{tournament.name}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{spotsLabel(tournament)}</span>
      </div>
      <p className="text-sm">
        {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}
        <br />
        {courtsText(tournament.courtNames)}
        <br />
        {formatText(tournament)}
        <br />
        {tournament.price > 0 ? `${formatPrice(tournament.price)} por persona` : 'Sin costo'}
      </p>
      {leader ? (
        <p className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 font-semibold">
          <Icon name="trophy" className="shrink-0 text-accent-ink" />
          {`${tournament.status === 'finished' ? 'Campeón' : 'Va ganando'}: ${leader.name}, ${leader.points} pts`}
        </p>
      ) : null}
      {status.ok ? (
        <Link href={`${href}?anotarme=1`} className={buttonClasses({ fullWidth: true })}>
          {status.text}
        </Link>
      ) : (
        <>
          {signingUp ? <p className="text-sm text-fg-muted">{status.text}</p> : null}
          <Link href={href} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            {tournament.status === 'finished' ? 'Ver resultados' : 'Ver torneo'}
          </Link>
        </>
      )}
    </Card>
  )
}
