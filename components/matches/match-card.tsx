import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/domain/format'
import type { JoinStatus } from '@/lib/domain/match-join'
import type { Risk } from '@/lib/domain/match-risk'
import {
  categoryRangeLabel,
  MATCH_TYPE_LABELS,
  missingText,
  perPlayerPrice,
  SLOT_SIDE_WORDS,
  statusLabel,
  type Match,
} from '@/lib/domain/matches'
import { MatchCourt } from './match-court'

export type MatchCardProps = {
  match: Match
  viewerId: string
  whenText: string
  status: JoinStatus
  risk: Risk | null
  reasons?: string[]
}

// Prototype: matchCard. Joining goes through the detail page, which explains the rules first.
export function MatchCard({ match, viewerId, whenText, status, risk, reasons = [] }: MatchCardProps) {
  const href = `/partidos/${match.id}`
  const joinSide = status.ok ? match.slots.find((slot) => slot.position === status.position)?.side : undefined
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-xl font-bold uppercase">{whenText}</p>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabel(match)}</span>
      </div>
      <div className="flex gap-3">
        <MatchCourt match={match} viewerId={viewerId} compact />
        <p className="text-sm">
          {match.courtName ?? match.preferredCourtName}
          <br />
          {categoryRangeLabel(match.categoryMin, match.categoryMax)}, {MATCH_TYPE_LABELS[match.type].toLowerCase()}
          <br />
          {match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} por persona` : 'Precio a confirmar'}
        </p>
      </div>
      {match.status === 'forming' ? <p className="font-semibold">{missingText(match)}</p> : null}
      {reasons.length > 0 ? (
        <ul aria-label="Por qué te lo mostramos" className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <li key={reason} className="rounded-full border border-court-ink px-2 py-0.5 text-xs text-court-ink">
              {reason}
            </li>
          ))}
        </ul>
      ) : status.ok ? null : (
        <p className="text-sm text-fg-muted">{status.text}</p>
      )}
      {risk ? (
        <p role="note" className={cn('rounded-xl border p-2 text-sm', risk.level === 'bad' ? 'border-accent' : 'border-border')}>
          {risk.text}
        </p>
      ) : null}
      <div className="flex gap-2">
        {status.ok && joinSide ? (
          <Link href={`${href}?sumarme=${status.position}`} className={buttonClasses({ className: 'flex-1' })}>
            Sumarme de {SLOT_SIDE_WORDS[joinSide]}
          </Link>
        ) : null}
        <Link href={href} className={buttonClasses({ variant: 'secondary', className: status.ok ? undefined : 'flex-1' })}>
          {status.ok ? 'Detalle' : 'Ver partido'}
        </Link>
      </div>
    </Card>
  )
}
