import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card, CARD_LINK } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
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

// Prototype: matchCard. Joining goes through the detail page, which explains the rules first. The whole card opens the
// match («Ver partido» stretched over it); the join button sits above it, secondary: a list of matches has no single
// main action, and each card filled in amber made the screen shout.
export function MatchCard({ match, viewerId, whenText, status, risk, reasons = [] }: MatchCardProps) {
  const href = `/partidos/${match.id}`
  const joinSide = status.ok ? match.slots.find((slot) => slot.position === status.position)?.side : undefined
  return (
    <Card className="relative flex h-full flex-col gap-3 hover:border-accent">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-xl font-bold uppercase">{whenText}</p>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabel(match)}</span>
      </div>
      <div className="flex gap-3">
        <MatchCourt match={match} viewerId={viewerId} compact />
        <div className="flex flex-col gap-1">
          {match.status === 'forming' ? <p className="font-semibold">{missingText(match)}</p> : null}
          <p className="text-sm">
            {match.courtName ?? match.preferredCourtName}
            <br />
            {categoryRangeLabel(match.categoryMin, match.categoryMax)}, {MATCH_TYPE_LABELS[match.type].toLowerCase()}
            <br />
            {match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} por persona` : 'Precio a confirmar'}
          </p>
        </div>
      </div>
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
        <p role="note" className={cn('flex items-center gap-2 text-sm', risk.level === 'bad' ? 'font-semibold text-accent-ink' : 'text-fg-muted')}>
          <Icon name="alert" className="size-4" />
          {risk.short}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Link href={href} className={CARD_LINK}>
          Ver partido
          <Icon name="chevron-right" className="size-4" />
        </Link>
        {status.ok && joinSide ? (
          <Link href={`${href}?sumarme=${status.position}`} className={buttonClasses({ variant: 'secondary', className: 'relative z-10' })}>
            Sumarme de {SLOT_SIDE_WORDS[joinSide]}
          </Link>
        ) : null}
      </div>
    </Card>
  )
}
