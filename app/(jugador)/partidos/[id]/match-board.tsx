'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { JoinSheet } from '@/components/matches/join-sheet'
import { MatchCourt } from '@/components/matches/match-court'
import { ShareSheet } from '@/components/matches/share-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import type { JoinStatus } from '@/lib/domain/match-join'
import type { Risk } from '@/lib/domain/match-risk'
import {
  CANCEL_REASON_TEXT,
  categoryRangeLabel,
  isInMatch,
  MATCH_TYPE_LABELS,
  missingText,
  perPlayerPrice,
  statusLabel,
  type LeaveStatus,
  type Match,
} from '@/lib/domain/matches'

export type MatchBoardProps = {
  match: Match
  viewerId: string
  whenText: string
  status: JoinStatus
  joinable: number[]
  initialJoin: number | null
  risk: Risk | null
  howItWorks: string
  paymentNote: string
  closeHours: number
  leave: LeaveStatus
  shareText: string
  joinAction: FormAction
  leaveAction: FormAction
  children?: ReactNode
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

// Prototype: sheet "match", as a page: it is also where the shared link lands.
export function MatchBoard(props: MatchBoardProps) {
  const { match, viewerId, status, risk, leave } = props
  const [joinPosition, setJoinPosition] = useState<number | null>(props.initialJoin)
  const [sheet, setSheet] = useState<'share' | 'leave' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setJoinPosition(null)
    setSheet(null)
    setNotice(message)
  }, [])
  const forming = match.status === 'forming'
  const court =
    match.status === 'confirmed'
      ? (match.courtName ?? match.preferredCourtName)
      : `${match.preferredCourtName}${match.allowOtherCourt ? ', o la que quede libre' : ''}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{props.whenText}</h1>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabel(match)}</span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cancha</dt>
        <dd>{court}</dd>
        <dt className="text-fg-muted">Categoría</dt>
        <dd>
          {categoryRangeLabel(match.categoryMin, match.categoryMax)}, {MATCH_TYPE_LABELS[match.type].toLowerCase()}
        </dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>
          {match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} c/u. ` : ''}
          {props.paymentNote}
        </dd>
      </dl>
      {forming ? <p className="font-semibold">{missingText(match)}</p> : null}
      {forming && status.ok ? <p className="text-sm">Tocá un lugar amarillo para sumarte.</p> : null}
      <MatchCourt match={match} viewerId={viewerId} joinable={props.joinable} onJoin={setJoinPosition} />
      {forming && !status.ok && !isInMatch(match, viewerId) && status.text ? (
        <p role="note" className="rounded-xl border border-border p-3">
          No podés sumarte: {lowerFirst(status.text)}
        </p>
      ) : null}
      {risk ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          {risk.text}
        </p>
      ) : null}
      {match.status === 'cancelled' && match.cancelReason ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          Se canceló. {CANCEL_REASON_TEXT[match.cancelReason]}
        </p>
      ) : null}
      {match.status === 'confirmed' && match.courtId && match.courtId !== match.preferredCourtId ? (
        <p className="text-sm">
          La {match.preferredCourtName} estaba reservada, así que el partido pasó a la {match.courtName}.
        </p>
      ) : null}
      {forming ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">¿Cómo funciona?</summary>
          <p className="mt-2 text-sm text-fg-muted">{props.howItWorks}</p>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {forming ? <Button onClick={() => setSheet('share')}>Compartir en WhatsApp</Button> : null}
        {leave?.allowed ? (
          <Button variant="ghost" onClick={() => setSheet('leave')}>
            Salir del partido
          </Button>
        ) : leave ? (
          <p className="text-sm text-fg-muted">{leave.reason}</p>
        ) : null}
      </div>
      {props.children}

      {joinPosition !== null ? (
        <JoinSheet
          match={match}
          position={joinPosition}
          whenText={props.whenText}
          paymentNote={props.paymentNote}
          closeHours={props.closeHours}
          action={props.joinAction}
          onClose={() => setJoinPosition(null)}
          onDone={done}
        />
      ) : null}
      {sheet === 'share' ? <ShareSheet text={props.shareText} onClose={close} /> : null}
      <BottomSheet open={sheet === 'leave'} onClose={close} title="Salir del partido">
        <p className="mb-4">
          {match.status === 'confirmed'
            ? 'Tu lugar queda libre y el partido vuelve a buscar gente. La cancha sigue reservada hasta la hora de cierre.'
            : 'Tu lugar queda libre para otro.'}
        </p>
        <ActionForm action={props.leaveAction} submitLabel="Sí, salir" pendingLabel="Saliendo…" onDone={done}>
          <input type="hidden" name="matchId" value={match.id} />
        </ActionForm>
      </BottomSheet>
    </div>
  )
}
