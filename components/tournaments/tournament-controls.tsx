'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { missingScores, type Tournament } from '@/lib/domain/tournaments'

export type TournamentStepActions = { close: FormAction; reopen: FormAction; start: FormAction; finish: FormAction; cancel: FormAction }

function Step({
  action,
  tournamentId,
  label,
  pendingLabel,
  variant,
}: {
  action: FormAction
  tournamentId: string
  label: string
  pendingLabel: string
  variant?: ButtonVariant
}) {
  return (
    <ActionForm action={action} submitLabel={label} pendingLabel={pendingLabel} variant={variant}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
    </ActionForm>
  )
}

// Design: "Gestión". Only the step that fits the current state: close, reopen or build the fixture,
// finish; and cancel until it finished.
export function TournamentControls({ tournament, actions }: { tournament: Tournament; actions: TournamentStepActions }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { status, id } = tournament
  const missing = missingScores(tournament.games)

  return (
    <section aria-label="Acciones del torneo" className="flex flex-col gap-3">
      {status === 'registration' ? (
        <Step action={actions.close} tournamentId={id} label="Cerrar inscripción" pendingLabel="Cerrando…" />
      ) : null}
      {status === 'closed' ? (
        <>
          <p className="text-sm text-fg-muted">
            El fixture se arma con 8, 12 o 16 anotados. Hay {tournament.entries.length}.
          </p>
          <Step action={actions.start} tournamentId={id} label="Armar fixture" pendingLabel="Armando…" />
          <Step action={actions.reopen} tournamentId={id} label="Reabrir inscripción" pendingLabel="Abriendo…" variant="secondary" />
        </>
      ) : null}
      {status === 'in_progress' ? (
        <>
          {missing > 0 ? (
            <p className="text-sm text-fg-muted">
              {missing === 1 ? 'Falta cargar 1 resultado.' : `Faltan cargar ${missing} resultados.`}
            </p>
          ) : null}
          <Step action={actions.finish} tournamentId={id} label="Finalizar torneo" pendingLabel="Finalizando…" />
        </>
      ) : null}
      {status !== 'finished' && status !== 'cancelled' ? (
        <Button variant="danger" fullWidth onClick={() => setConfirmCancel(true)}>
          Cancelar torneo
        </Button>
      ) : null}
      <BottomSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar torneo">
        <p className="mb-4">
          Libera las canchas y los anotados lo ven en la app. Lo que ya se cobró queda en Cobros para devolver.
        </p>
        <Step action={actions.cancel} tournamentId={id} label="Sí, cancelar el torneo" pendingLabel="Cancelando…" variant="danger" />
      </BottomSheet>
    </section>
  )
}
