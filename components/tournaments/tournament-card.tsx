import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import { courtsText, formatText, spotsLabel, type EntryStatus, type Tournament } from '@/lib/domain/tournaments'

// Design: "Lista /torneos". Signing up goes through the detail page, which explains the rules first.
export function TournamentCard({ tournament, whenText, status }: { tournament: Tournament; whenText: string; status: EntryStatus }) {
  const href = `/torneos/${tournament.id}`
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
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
      {status.ok ? (
        <Link href={`${href}?anotarme=1`} className={buttonClasses({ fullWidth: true })}>
          {status.text}
        </Link>
      ) : (
        <>
          {signingUp ? <p className="text-sm text-fg-muted">{status.text}</p> : null}
          <Link href={href} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Ver torneo
          </Link>
        </>
      )}
    </Card>
  )
}
