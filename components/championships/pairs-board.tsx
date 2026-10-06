'use client'

import { useCallback, useState } from 'react'
import { AddPairSheet } from '@/components/championships/add-pair-sheet'
import { PairsTable, type PairAction } from '@/components/championships/pairs-table'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import type { PairRow, PairsCategory } from '@/lib/domain/championship-pairs'
import type { Block } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'

export type PairsActions = { cash: FormAction; remove: FormAction; move: FormAction; add: FormAction; hours: FormAction }

type Sheet = { kind: 'add' } | { kind: PairAction; row: PairRow; categoryId: string }

// Design: "Gestión": a table of pairs per category, the waiting line in it, and "Cargar pareja". editable: until
// the draw (registration or closed).
export function PairsBoard({
  categories,
  editable,
  acceptsCash,
  members,
  blocks,
  actions,
}: {
  categories: PairsCategory[]
  editable: boolean
  acceptsCash: boolean
  members: MemberOption[]
  blocks: Block[]
  actions: PairsActions
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  const targets = sheet && sheet.kind === 'move' ? categories.filter((category) => category.id !== sheet.categoryId) : []

  return (
    <section aria-labelledby="parejas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="parejas" className="font-display text-2xl font-bold uppercase">
          Parejas
        </h2>
        {editable && categories.length > 0 ? <Button onClick={() => setSheet({ kind: 'add' })}>Cargar pareja</Button> : null}
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`categoria-${category.id}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 id={`categoria-${category.id}`} className="font-display text-xl font-bold uppercase">
              {category.name}
            </h3>
            <span className="text-sm text-fg-muted tabular-nums">{category.spots}</span>
          </div>
          <PairsTable
            category={category}
            editable={editable}
            acceptsCash={acceptsCash}
            cashAction={actions.cash}
            onAction={(kind, row) => setSheet({ kind, row, categoryId: category.id })}
          />
        </section>
      ))}

      {sheet?.kind === 'add' ? (
        <AddPairSheet categories={categories} members={members} action={actions.add} onClose={close} onDone={done} />
      ) : null}
      {sheet?.kind === 'hours' ? (
        <UnavailabilitySheet
          entryId={sheet.row.entryId}
          blocks={blocks}
          selected={sheet.row.unavailable}
          note={sheet.row.hoursNote}
          max={null}
          action={actions.hours}
          onClose={close}
          onDone={done}
        />
      ) : null}
      <BottomSheet open={sheet?.kind === 'move'} onClose={close} title="Mover a otra categoría">
        {sheet?.kind === 'move' ? (
          targets.length > 0 ? (
            <ActionForm action={actions.move} submitLabel="Mover" pendingLabel="Moviendo…" onDone={done}>
              <p>{sheet.row.pair}. Si en la otra categoría no hay lugar, queda en la lista de espera.</p>
              <input type="hidden" name="entryId" value={sheet.row.entryId} />
              <Field label="Categoría" htmlFor="move-category">
                <select id="move-category" name="categoryId" className={inputClasses}>
                  {targets.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          ) : (
            <p>No hay otra categoría abierta.</p>
          )
        ) : null}
      </BottomSheet>
      <BottomSheet open={sheet?.kind === 'remove'} onClose={close} title="Quitar pareja">
        {sheet?.kind === 'remove' ? (
          <ActionForm action={actions.remove} submitLabel="Sí, quitar la pareja" pendingLabel="Quitando…" variant="danger" onDone={done}>
            <p>
              {sheet.row.pair} deja de estar en el campeonato. Si había pagado, aparece en Cobros para devolver, y si tenía
              lugar, entra la primera pareja en espera.
            </p>
            <input type="hidden" name="entryId" value={sheet.row.entryId} />
          </ActionForm>
        ) : null}
      </BottomSheet>
    </section>
  )
}
