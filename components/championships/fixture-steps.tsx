'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { ChampionshipStatus } from '@/lib/domain/championships'

export type FixtureStepActions = { draw: FormAction; schedule: FormAction; publish: FormAction; finish: FormAction }

function unplacedText(count: number): string {
  return count === 1
    ? '1 partido quedó sin lugar: ubicalo a mano o volvé a programar.'
    : `${count} partidos quedaron sin lugar: ubicalos a mano o volvé a programar.`
}

// Design: the steps of the organizer: "Sortear", "Programar", "Publicar", and at the end "Finalizar"; only the
// ones that fit.
export function FixtureSteps({
  championshipId,
  status,
  scheduled,
  unplaced,
  finishable,
  actions,
}: {
  championshipId: string
  status: ChampionshipStatus
  scheduled: number
  unplaced: number
  finishable: boolean
  actions: FixtureStepActions
}) {
  const id = <input type="hidden" name="championshipId" value={championshipId} />

  if (status === 'closed') {
    return (
      <section aria-label="Sorteo" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Con la inscripción cerrada, sorteá las zonas y las llaves de todas las categorías. Hasta publicar, se puede
          volver a sortear.
        </p>
        <ActionForm action={actions.draw} submitLabel="Sortear" pendingLabel="Sorteando…">
          {id}
        </ActionForm>
      </section>
    )
  }

  if (status === 'drawn') {
    return (
      <section aria-label="Programación" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          {scheduled === 0
            ? 'Programá todos los partidos en las canchas y horarios de los días de juego.'
            : unplaced > 0
              ? unplacedText(unplaced)
              : 'Todos los partidos tienen cancha y horario. Revisalos y publicá el fixture.'}
        </p>
        <ActionForm
          action={actions.schedule}
          submitLabel={scheduled === 0 ? 'Programar' : 'Volver a programar'}
          pendingLabel="Programando…"
          variant={scheduled === 0 ? 'primary' : 'secondary'}
        >
          {id}
        </ActionForm>
        {scheduled > 0 && unplaced === 0 ? (
          <ActionForm action={actions.publish} submitLabel="Publicar fixture" pendingLabel="Publicando…">
            {id}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="releaseFree" className="size-5 accent-accent" />
              <span>Devolver a la grilla las franjas sin partidos</span>
            </label>
          </ActionForm>
        ) : null}
        <ActionForm action={actions.draw} submitLabel="Volver a sortear" pendingLabel="Sorteando…" variant="ghost">
          {id}
        </ActionForm>
      </section>
    )
  }

  if (status === 'in_progress' && finishable) {
    return (
      <section aria-label="Cierre" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">Ya se jugaron todos los partidos y las finales.</p>
        <ActionForm action={actions.finish} submitLabel="Finalizar campeonato" pendingLabel="Finalizando…">
          {id}
        </ActionForm>
      </section>
    )
  }
  return null
}
