'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, type ButtonVariant } from '@/components/ui/button'
import type { ChampionshipStatus } from '@/lib/domain/championships'

export type ControlActions = { open: FormAction; close: FormAction; cancel: FormAction }

function Step({
  action,
  championshipId,
  label,
  pendingLabel,
  variant,
}: {
  action: FormAction
  championshipId: string
  label: string
  pendingLabel: string
  variant?: ButtonVariant
}) {
  return (
    <ActionForm action={action} submitLabel={label} pendingLabel={pendingLabel} variant={variant}>
      <input type="hidden" name="championshipId" value={championshipId} />
    </ActionForm>
  )
}

// Design: "Gestión": "Abrir inscripción", "Cerrar inscripción", "Cancelar campeonato"; only the step that fits.
// part: the championship page shows the steps in its header and "Cancelar campeonato" apart, at the end of Ajustes.
export function ChampionshipControls({
  championshipId,
  status,
  readiness,
  actions,
  part = 'all',
}: {
  championshipId: string
  status: ChampionshipStatus
  readiness: string | null
  actions: ControlActions
  part?: 'all' | 'steps' | 'cancel'
}) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const steps = part !== 'cancel' && (status === 'draft' || status === 'registration')
  const cancellable = part !== 'steps' && status !== 'finished' && status !== 'cancelled'
  if (!steps && !cancellable) return null

  return (
    <section aria-label="Acciones del campeonato" className="flex flex-col gap-3">
      {steps && status === 'draft' && readiness ? <p className="text-sm text-fg-muted">{readiness}</p> : null}
      {steps && status === 'draft' && !readiness ? (
        <>
          <p className="text-sm text-fg-muted">
            Al abrir la inscripción, las canchas de los días de juego quedan bloqueadas y los socios ya se pueden anotar.
          </p>
          <Step action={actions.open} championshipId={championshipId} label="Abrir inscripción" pendingLabel="Abriendo…" />
        </>
      ) : null}
      {steps && status === 'registration' ? (
        <Step action={actions.close} championshipId={championshipId} label="Cerrar inscripción" pendingLabel="Cerrando…" />
      ) : null}
      {cancellable ? (
        <>
          <Button variant="danger" fullWidth onClick={() => setConfirmCancel(true)}>
            Cancelar campeonato
          </Button>
          <BottomSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar campeonato">
            <p className="mb-4">
              Libera las canchas y les avisa a los anotados. Lo que ya se cobró queda en Cobros para devolver.
            </p>
            <Step
              action={actions.cancel}
              championshipId={championshipId}
              label="Sí, cancelar el campeonato"
              pendingLabel="Cancelando…"
              variant="danger"
            />
          </BottomSheet>
        </>
      ) : null}
    </section>
  )
}
