'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { ShareStatus, useShare } from '@/components/ui/share-button'
import { cn } from '@/lib/cn'
import { avatarTone, pairInitials } from '@/lib/domain/championship-cards'
import type { MatchView } from '@/lib/domain/championship-views'

export type MatchShare = { title: string; text: string }

// The public match card: when and where on a strip; each pair with its initials and one digit per set, the winner bold
// in the club's accent; a share button on the right. With href, the whole card is a link (and there is no share).
export function MatchCard({ match, share, topLine, href }: { match: MatchView; share?: MatchShare; topLine?: string; href?: string }) {
  const card = (
    <article
      aria-label={`${match.sideA} contra ${match.sideB}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-surface',
        match.status === 'playing' ? 'border-accent' : 'border-border',
        href && 'transition-colors hover:border-accent',
      )}
    >
      {topLine ? <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{topLine}</p> : null}
      <Strip match={match} />
      <div className="flex">
        <div role="table" aria-label="Resultado" className="flex min-w-0 flex-1 flex-col divide-y divide-border px-3">
          <Side match={match} side="a" />
          <Side match={match} side="b" />
        </div>
        {share && !href ? <ShareCell match={match} share={share} /> : null}
      </div>
    </article>
  )
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {card}
    </Link>
  ) : (
    card
  )
}

function Strip({ match }: { match: MatchView }) {
  const when = match.day && match.time ? `${match.day} ${match.time}` : 'Sin horario todavía'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-bg/60 px-3 py-2 text-sm text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <Icon name="calendar" className="size-4" />
        {when}
      </span>
      {match.court ? (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="pin" className="size-4" />
          {match.court}
        </span>
      ) : null}
      {match.status === 'playing' ? (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-on-accent">
          <span aria-hidden="true" className="size-2 rounded-full bg-on-accent motion-safe:animate-pulse" />
          En juego
        </span>
      ) : match.status === 'walkover' ? (
        <span className="ml-auto rounded-full border border-border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">W.O.</span>
      ) : null}
    </div>
  )
}

function Side({ match, side }: { match: MatchView; side: 'a' | 'b' }) {
  const name = side === 'a' ? match.sideA : match.sideB
  const known = (side === 'a' ? match.entryA : match.entryB) !== null
  const won = match.winner === side
  const lost = match.winner !== null && !won
  return (
    <div role="row" data-winner={won} className="flex min-h-14 items-center gap-3 py-2">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold',
          known ? avatarTone(name) : 'border border-dashed border-border text-fg-muted',
        )}
      >
        {known ? pairInitials(name) : '?'}
      </span>
      <span
        role="rowheader"
        className={cn('min-w-0 flex-1 leading-tight', won && 'font-bold', lost && 'text-fg-muted', !known && 'italic text-fg-muted')}
      >
        {name}
        {won ? <span className="sr-only"> (ganó)</span> : null}
      </span>
      {match.sets.map((set, index) => {
        const games = side === 'a' ? set.a : set.b
        return (
          <span
            key={index}
            role="cell"
            aria-label={set.inProgress ? `${games} (set en juego)` : undefined}
            className={cn(
              'grid w-6 shrink-0 place-items-center font-display text-2xl font-bold tabular-nums',
              won ? 'text-accent-ink' : lost ? 'text-fg-muted' : 'text-fg',
              set.inProgress && 'rounded-md ring-2 ring-accent',
            )}
          >
            {games}
          </span>
        )
      })}
    </div>
  )
}

function ShareCell({ match, share }: { match: MatchView; share: MatchShare }) {
  const { share: open, status } = useShare(share.title, share.text)
  return (
    <div className="flex shrink-0 flex-col items-center justify-center border-l border-border px-1">
      <button
        type="button"
        onClick={open}
        aria-label={`Compartir ${match.sideA} contra ${match.sideB}`}
        className="grid size-11 place-items-center rounded-xl text-fg-muted hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name={status === 'copied' ? 'check-circle' : 'share'} className={status === 'copied' ? 'text-court-ink' : undefined} />
      </button>
      {status !== 'idle' ? (
        <div className="sr-only">
          <ShareStatus status={status} text={share.text} />
        </div>
      ) : null}
    </div>
  )
}
