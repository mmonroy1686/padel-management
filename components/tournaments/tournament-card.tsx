import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card, CARD_LINK } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { tournamentRanking } from '@/lib/domain/tournament-ranking'
import { courtsText, formatText, spotsLabel, type EntryStatus, type Tournament } from '@/lib/domain/tournaments'

// Design: "Lista /torneos". Signing up goes through the detail page, which explains the rules first. The whole card
// opens the tournament (its «Ver» link stretched over it); signing up sits above it, secondary, as on Partidos.
export function TournamentCard({ tournament, whenText, status }: { tournament: Tournament; whenText: string; status: EntryStatus }) {
  const href = `/torneos/${tournament.id}`
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
  // Once results are in, the card says who won or who leads.
  const leader = tournament.status === 'finished' || tournament.status === 'in_progress'
    ? tournamentRanking(tournament).find((row) => row.played > 0)
    : undefined
  return (
    <Card className="relative flex flex-col gap-3 hover:border-accent">
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
      {!status.ok && signingUp ? <p className="text-sm text-fg-muted">{status.text}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={href} className={CARD_LINK}>
          {tournament.status === 'finished' ? 'Ver resultados' : 'Ver torneo'}
          <Icon name="chevron-right" className="size-4" />
        </Link>
        {status.ok ? (
          <Link href={`${href}?anotarme=1`} className={buttonClasses({ variant: 'outline', className: 'relative z-10' })}>
            {status.text}
          </Link>
        ) : null}
      </div>
    </Card>
  )
}
