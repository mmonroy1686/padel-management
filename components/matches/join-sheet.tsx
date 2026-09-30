'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { formatPrice } from '@/lib/domain/format'
import { openSlots, perPlayerPrice, SLOT_SIDE_WORDS, type Match } from '@/lib/domain/matches'

// Prototype: sheet "join". Every rule that affects the player is said before confirming.
export function JoinSheet({
  match,
  position,
  whenText,
  paymentNote,
  closeHours,
  action,
  onClose,
  onDone,
}: {
  match: Match
  position: number
  whenText: string
  paymentNote: string
  closeHours: number
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const slot = match.slots.find((candidate) => candidate.position === position)
  if (!slot) return null
  const last = openSlots(match).length === 1
  const players = match.slots.flatMap((candidate) => (candidate.playerName ? [candidate.playerName] : [])).join(', ')
  const where = match.allowOtherCourt ? `${match.preferredCourtName} (o la que quede libre)` : match.preferredCourtName

  return (
    <BottomSheet open onClose={onClose} title={`Sumarte de ${SLOT_SIDE_WORDS[slot.side]}`}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-fg-muted">Cuándo</dt>
          <dd>{whenText}</dd>
          <dt className="text-fg-muted">Dónde</dt>
          <dd>{where}</dd>
          <dt className="text-fg-muted">Con quién</dt>
          <dd>{players || 'Todavía nadie'}</dd>
          <dt className="text-fg-muted">Precio</dt>
          <dd>{match.price !== null ? `${formatPrice(perPlayerPrice(match.price))} c/u` : 'A confirmar'}</dd>
        </dl>
        <p>{paymentNote}</p>
        {last ? (
          <p role="note" className="rounded-xl border border-accent p-3">
            Sos el cuarto: al confirmar se reserva la cancha y el partido queda confirmado.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Si {closeHours} h antes no se completa, se cancela solo y no pagás nada.</p>
        )}
        <ActionForm action={action} submitLabel="Confirmar lugar" pendingLabel="Sumándote…" onDone={onDone}>
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="position" value={position} />
        </ActionForm>
      </div>
    </BottomSheet>
  )
}
