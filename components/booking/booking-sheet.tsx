'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { perPlayerPrice } from '@/lib/domain/matches'

export type BookingChoice = { courtId: string; courtName: string; startsAt: string; timeLabel: string; price: number }

export type BookingSheetProps = {
  choice: BookingChoice | null
  dayText: string
  paymentNote: string
  cancellationRule: string
  action: FormAction
  onClose: () => void
  onBooked: (message: string) => void
  onCreateMatch?: (choice: BookingChoice) => void
}

// Every rule that affects the player is explained before she books: price, how to pay, cancelling.
export function BookingSheet({ choice, dayText, paymentNote, cancellationRule, action, onClose, onBooked, onCreateMatch }: BookingSheetProps) {
  return (
    <BottomSheet open={choice !== null} onClose={onClose} title="Reservar cancha">
      {choice ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-fg-muted">Cancha</dt>
            <dd>{choice.courtName}</dd>
            <dt className="text-fg-muted">Horario</dt>
            <dd>
              {dayText}, {choice.timeLabel}
            </dd>
            <dt className="text-fg-muted">Precio</dt>
            <dd className="font-display text-2xl font-bold">{formatPrice(choice.price)}</dd>
          </dl>
          <p>{paymentNote}</p>
          <p className="text-sm text-fg-muted">{cancellationRule}</p>
          <ActionForm
            key={`${choice.courtId}-${choice.startsAt}`}
            action={action}
            submitLabel="Reservar"
            pendingLabel="Reservando…"
            onDone={onBooked}
          >
            <input type="hidden" name="courtId" value={choice.courtId} />
            <input type="hidden" name="startsAt" value={choice.startsAt} />
          </ActionForm>
          {onCreateMatch ? (
            <>
              <Button variant="secondary" fullWidth onClick={() => onCreateMatch(choice)}>
                Armar partido abierto, {formatPrice(perPlayerPrice(choice.price))} c/u
              </Button>
              <p className="text-sm text-fg-muted">
                Con el partido abierto la cancha no se bloquea hasta que estén los 4. Cada uno paga su parte.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  )
}
