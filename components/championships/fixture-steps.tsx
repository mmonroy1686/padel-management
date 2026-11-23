'use client'

import type { ReactNode } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { ChampionshipStatus } from '@/lib/domain/championships'

export type FixtureStepActions = { draw: FormAction; schedule: FormAction; publish: FormAction; finish: FormAction }

type StepKey = 'draw' | 'schedule' | 'publish'
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'draw', label: 'Sortear' },
  { key: 'schedule', label: 'Programar' },
  { key: 'publish', label: 'Publicar' },
]

function unplacedText(count: number): string {
  return count === 1
    ? '1 partido quedó sin lugar: ubicalo a mano (Mover, en la tabla) o volvé a programar.'
    : `${count} partidos quedaron sin lugar: ubicalos a mano (Mover, en la tabla) o volvé a programar.`
}

// The three steps as a row: done ones with a check, the current one marked (aria-current), the rest muted.
function Progress({ current }: { current: StepKey }) {
  const index = STEPS.findIndex((step) => step.key === current)
  return (
    <ol aria-label="Pasos del fixture" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {STEPS.map((step, position) => {
        const done = position < index
        const now = position === index
        return (
          <li key={step.key} aria-current={now ? 'step' : undefined} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs font-bold',
                done && 'border-accent bg-accent text-on-accent',
                now && 'border-accent text-accent-ink',
                !done && !now && 'border-border text-fg-muted',
              )}
            >
              {done ? <Icon name="check" className="size-3.5" /> : position + 1}
            </span>
            <span className={cn('font-semibold', !done && !now && 'text-fg-muted')}>
              <span>{step.label}</span>
              {done ? <span className="sr-only">Hecho</span> : null}
            </span>
            {position < STEPS.length - 1 ? <span aria-hidden="true" className="h-px w-6 bg-border" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

// One card: where the organizer is, what comes next and its one main action; what undoes a step goes apart,
// smaller, under "Otras acciones".
function StepCard({
  label,
  current,
  title,
  text,
  main,
  others,
}: {
  label: string
  current: StepKey | null
  title: string
  text: string
  main: ReactNode
  others?: ReactNode
}) {
  const titleId = `paso-${label}`
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-2xl border-2 border-accent bg-surface p-4">
      {current ? <Progress current={current} /> : null}
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="font-display text-xl font-bold uppercase">
          {title}
        </h3>
        <p className="text-sm text-fg-muted">{text}</p>
      </div>
      {main}
      {others ? (
        <div role="group" aria-label="Otras acciones" className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-sm text-fg-muted">Otras acciones:</span>
          {others}
        </div>
      ) : null}
    </section>
  )
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
  const redraw = (
    <ActionForm action={actions.draw} submitLabel="Volver a sortear" pendingLabel="Sorteando…" variant="ghost" size="sm">
      {id}
    </ActionForm>
  )

  if (status === 'closed') {
    return (
      <StepCard
        label="sorteo"
        current="draw"
        title="Siguiente paso: sortear"
        text="Con la inscripción cerrada, sorteá las zonas y las llaves de todas las categorías. Hasta publicar, se puede volver a sortear."
        main={
          <ActionForm action={actions.draw} submitLabel="Sortear" pendingLabel="Sorteando…">
            {id}
          </ActionForm>
        }
      />
    )
  }

  if (status === 'drawn' && (scheduled === 0 || unplaced > 0)) {
    return (
      <StepCard
        label="programacion"
        current="schedule"
        title="Siguiente paso: programar"
        text={
          scheduled === 0
            ? 'Programá todos los partidos en las canchas y horarios de los días de juego.'
            : unplacedText(unplaced)
        }
        main={
          <ActionForm
            action={actions.schedule}
            submitLabel={scheduled === 0 ? 'Programar' : 'Volver a programar'}
            pendingLabel="Programando…"
          >
            {id}
          </ActionForm>
        }
        others={redraw}
      />
    )
  }

  if (status === 'drawn') {
    return (
      <StepCard
        label="publicacion"
        current="publish"
        title="Siguiente paso: publicar el fixture"
        text="Todos los partidos tienen cancha y horario. Revisalos en la tabla (podés moverlos o fijarlos) y publicá: los jugadores ven sus partidos y queda el link para compartir."
        main={
          <ActionForm action={actions.publish} submitLabel="Publicar fixture" pendingLabel="Publicando…">
            {id}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="releaseFree" className="size-5 accent-accent" />
              <span>Devolver a la grilla las franjas sin partidos</span>
            </label>
          </ActionForm>
        }
        others={
          <>
            <ActionForm
              action={actions.schedule}
              submitLabel="Volver a programar"
              pendingLabel="Programando…"
              variant="secondary"
              size="sm"
            >
              {id}
            </ActionForm>
            {redraw}
          </>
        }
      />
    )
  }

  if (status === 'in_progress' && finishable) {
    return (
      <StepCard
        label="cierre"
        current={null}
        title="Siguiente paso: finalizar"
        text="Ya se jugaron todos los partidos y las finales."
        main={
          <ActionForm action={actions.finish} submitLabel="Finalizar campeonato" pendingLabel="Finalizando…">
            {id}
          </ActionForm>
        }
      />
    )
  }
  return null
}
