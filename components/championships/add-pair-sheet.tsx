'use client'

import { PairPlayerFields } from '@/components/championships/pair-player-fields'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { MemberOption } from '@/lib/domain/members'

// Design: "Cargar pareja": reception loads a whole pair (members, people from outside or one of each).
export function AddPairSheet({
  categories,
  members,
  action,
  onClose,
  onDone,
}: {
  categories: { id: string; name: string }[]
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  return (
    <BottomSheet open onClose={onClose} title="Cargar pareja">
      <ActionForm action={action} submitLabel="Cargar pareja" pendingLabel="Cargando…" onDone={onDone}>
        <Field label="Categoría" htmlFor="pair-category">
          <select id="pair-category" name="categoryId" className={inputClasses}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <PairPlayerFields prefix="player1" legend="Jugador 1" members={members} />
        <PairPlayerFields prefix="player2" legend="Jugador 2" members={members} />
        <Field label="Nota (opcional)" htmlFor="pair-note">
          <textarea id="pair-note" name="note" rows={2} maxLength={300} className={cn(inputClasses, 'py-2')} />
        </Field>
      </ActionForm>
    </BottomSheet>
  )
}
