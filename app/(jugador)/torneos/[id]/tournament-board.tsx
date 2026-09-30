'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { ShareSheet } from '@/components/matches/share-sheet'
import { FixtureList } from '@/components/tournaments/fixture-list'
import { RankingTable } from '@/components/tournaments/ranking-table'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from '@/lib/domain/matches'
import type { RankingRow } from '@/lib/domain/tournament-ranking'
import type { EntryPaymentView } from '@/lib/domain/tournament-payments'
import {
  courtsText,
  formatText,
  TOURNAMENT_STATUS_LABELS,
  type EntryStatus,
  type Tournament,
  type TournamentLeaveStatus,
} from '@/lib/domain/tournaments'

export type TournamentBoardProps = {
  tournament: Tournament
  viewerId: string
  myEntryId: string | null
  whenText: string
  timezone: string
  status: EntryStatus
  leave: TournamentLeaveStatus
  payment: EntryPaymentView | null
  paymentNote: string
  transfer: { details: string | null; receiptRequired: boolean }
  shareText: string
  ranking: RankingRow[]
  initialJoin: boolean
  joinAction: FormAction
  leaveAction: FormAction
  reportAction: ReportTransfer
}

type Sheet = 'join' | 'leave' | 'share' | 'transfer'

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

// Design: "Detalle /torneos/[id]". It is also where the shared link lands.
export function TournamentBoard(props: TournamentBoardProps) {
  const { tournament, status, leave, payment } = props
  const [sheet, setSheet] = useState<Sheet | null>(props.initialJoin && status.ok ? 'join' : null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const signingUp = tournament.status === 'registration' || tournament.status === 'closed'
  const played = tournament.status === 'in_progress' || tournament.status === 'finished'
  const entered = props.myEntryId !== null
  const price = tournament.price > 0 ? `${formatPrice(tournament.price)} por persona. ${props.paymentNote}` : 'Sin costo.'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{tournament.name}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {TOURNAMENT_STATUS_LABELS[tournament.status]}
        </span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>{props.whenText}</dd>
        <dt className="text-fg-muted">Canchas</dt>
        <dd>{courtsText(tournament.courtNames)}</dd>
        <dt className="text-fg-muted">Categoría</dt>
        <dd>
          {categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, {MATCH_TYPE_LABELS[tournament.type].toLowerCase()}
        </dd>
        <dt className="text-fg-muted">Formato</dt>
        <dd>Americano: cada ronda cambiás de pareja. {formatText(tournament)}.</dd>
        <dt className="text-fg-muted">Precio</dt>
        <dd>{price}</dd>
      </dl>

      {payment ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
          <span className="font-semibold">Tu inscripción</span>
          <PaymentBadge state={payment.state} />
          {payment.canReportTransfer ? (
            <Button variant="secondary" onClick={() => setSheet('transfer')}>
              Ya transferí
            </Button>
          ) : null}
          {payment.rejectionReason ? (
            <p className="w-full text-sm">El club rechazó la transferencia: {payment.rejectionReason}.</p>
          ) : null}
        </div>
      ) : null}

      {signingUp ? (
        <section aria-labelledby="anotados" className="flex flex-col gap-2">
          <h2 id="anotados" className="font-display text-2xl font-bold uppercase">
            Anotados ({tournament.entries.length} de {tournament.maxPlayers})
          </h2>
          {tournament.entries.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tournament.entries.map((entry) => (
                <li key={entry.id} className="rounded-full border border-border px-3 py-1 text-sm">
                  {entry.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">Todavía no se anotó nadie.</p>
          )}
        </section>
      ) : null}

      {!status.ok && !entered && tournament.status === 'registration' ? (
        <p role="note" className="rounded-xl border border-border p-3">
          No podés anotarte: {lowerFirst(status.text)}
        </p>
      ) : null}
      {tournament.status === 'cancelled' ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          El club canceló este torneo.{entered ? ' Si pagaste, te devuelve la plata.' : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status.ok ? <Button onClick={() => setSheet('join')}>{status.text}</Button> : null}
        {tournament.status === 'registration' ? (
          <Button variant="secondary" onClick={() => setSheet('share')}>
            Compartir en WhatsApp
          </Button>
        ) : null}
        {leave?.allowed ? (
          <Button variant="ghost" onClick={() => setSheet('leave')}>
            Darme de baja
          </Button>
        ) : leave ? (
          <p className="text-sm text-fg-muted">{leave.reason}</p>
        ) : null}
      </div>

      {played ? (
        <>
          <section aria-labelledby="ranking" className="flex flex-col gap-2">
            <h2 id="ranking" className="font-display text-2xl font-bold uppercase">
              {tournament.status === 'finished' ? 'Ranking final' : 'Ranking en vivo'}
            </h2>
            <RankingTable rows={props.ranking} highlightEntryId={props.myEntryId} />
          </section>
          <section aria-labelledby="fixture" className="flex flex-col gap-2">
            <h2 id="fixture" className="font-display text-2xl font-bold uppercase">
              Fixture
            </h2>
            <FixtureList tournament={tournament} timezone={props.timezone} />
          </section>
        </>
      ) : null}

      <BottomSheet open={sheet === 'join'} onClose={close} title="Inscribirme">
        <p className="mb-4">
          Te anotás en {tournament.name}, {props.whenText}. {price} Podés darte de baja mientras la inscripción esté abierta.
        </p>
        <ActionForm action={props.joinAction} submitLabel="Confirmar inscripción" pendingLabel="Anotando…" onDone={done}>
          <input type="hidden" name="tournamentId" value={tournament.id} />
        </ActionForm>
      </BottomSheet>
      <BottomSheet open={sheet === 'leave'} onClose={close} title="Darme de baja">
        <p className="mb-4">
          Tu lugar queda libre para otro.{payment?.state === 'paid' && tournament.price > 0 ? ' Ya pagaste: el club te devuelve la plata.' : ''}
        </p>
        <ActionForm action={props.leaveAction} submitLabel="Sí, darme de baja" pendingLabel="Saliendo…" onDone={done}>
          <input type="hidden" name="tournamentId" value={tournament.id} />
        </ActionForm>
      </BottomSheet>
      {sheet === 'share' ? <ShareSheet text={props.shareText} onClose={close} /> : null}
      {sheet === 'transfer' && props.myEntryId && payment ? (
        <TransferSheet
          bookingId={props.myEntryId}
          userId={props.viewerId}
          amount={payment.due}
          details={props.transfer.details}
          receiptRequired={props.transfer.receiptRequired}
          reportAction={props.reportAction}
          onClose={close}
          onDone={done}
        />
      ) : null}
    </div>
  )
}
