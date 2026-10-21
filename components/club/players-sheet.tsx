'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field } from '@/components/ui/field'
import { playerLabel, type PlayerShare } from '@/lib/domain/club-home'
import type { MemberOption } from '@/lib/domain/members'
import { PlayerNameField } from './player-name-field'

// "Completar jugadores": players 2 to 4. Whoever already paid his share stays as he is (set_booking_players).
export function PlayersSheet({
  bookingId,
  players,
  members,
  action,
  onClose,
  onDone,
}: {
  bookingId: string
  players: PlayerShare[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const holder = players.find((player) => player.position === 1)
  return (
    <BottomSheet open onClose={onClose} title="Jugadores del turno">
      <ActionForm action={action} submitLabel="Guardar jugadores" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="bookingId" value={bookingId} />
        {holder ? (
          <p className="text-sm text-fg-muted">
            Jugador 1: {playerLabel(holder)}, quien reservó. Si no sabés quién juega, dejalo vacío.
          </p>
        ) : null}
        {players
          .filter((player) => player.position > 1)
          .map((player) =>
            player.locked && player.name !== null ? (
              <div key={player.position} className="flex flex-col gap-1">
                <p>
                  <span className="font-semibold">Jugador {player.position}:</span> {player.name} (ya pagó)
                </p>
                <input type="hidden" name={`player${player.position}Id`} value={player.playerId ?? ''} />
                <input type="hidden" name={`player${player.position}Name`} value={player.playerId ? '' : player.name} />
              </div>
            ) : (
              <Field key={player.position} label={`Jugador ${player.position}`} htmlFor={`player-${bookingId}-${player.position}`}>
                <PlayerNameField
                  id={`player-${bookingId}-${player.position}`}
                  position={player.position}
                  members={members}
                  initial={{ playerId: player.playerId, name: player.name }}
                />
              </Field>
            ),
          )}
      </ActionForm>
    </BottomSheet>
  )
}
