'use client'

import { useState } from 'react'
import { PairPlayerFields } from '@/components/championships/pair-player-fields'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import type { MemberOption } from '@/lib/domain/members'
import { CATEGORIES } from '@/lib/domain/profile'

// A category in the sheet: available when the viewer can sign up to it; full means the pair waits.
export type RegisterOption = { id: string; name: string; detail: string; full: boolean; available: boolean }

// Design: "Ventana para anotarse": the category, the category she plays and her partner (a member or someone
// from outside). register_championship_pair has the last word.
export function RegisterSheet({
  options,
  initialCategoryId,
  myLevel,
  members,
  action,
  onClose,
  onDone,
}: {
  options: RegisterOption[]
  initialCategoryId: string | null
  myLevel: number | null
  members: MemberOption[]
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const available = options.filter((option) => option.available)
  const [categoryId, setCategoryId] = useState<string>(
    available.some((option) => option.id === initialCategoryId) ? (initialCategoryId ?? '') : (available[0]?.id ?? ''),
  )
  const chosen = options.find((option) => option.id === categoryId)

  return (
    <BottomSheet open onClose={onClose} title="Anotarme">
      <ActionForm
        action={action}
        submitLabel={chosen?.full ? 'Anotarnos en la lista de espera' : 'Anotarnos'}
        pendingLabel="Anotando…"
        onDone={onDone}
      >
        <Field label="Categoría" htmlFor="register-category">
          <select
            id="register-category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={inputClasses}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.available}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        {chosen ? (
          <p className="text-sm text-fg-muted">
            {chosen.detail}.
            {chosen.full ? ' No quedan lugares: quedan en la lista de espera y entran solos si se libera uno.' : ''}
          </p>
        ) : null}
        <Field label="Tu categoría" htmlFor="register-level">
          <select id="register-level" name="myLevel" defaultValue={myLevel ?? 5} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <PairPlayerFields prefix="partner" legend="Tu compañero" members={members} />
        <p className="text-sm text-fg-muted">
          Si es socio, le llega un aviso. Cualquiera de los dos puede darlos de baja mientras la inscripción esté abierta.
        </p>
      </ActionForm>
    </BottomSheet>
  )
}
