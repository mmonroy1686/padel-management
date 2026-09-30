'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import {
  CATEGORIES,
  GENDER_LABELS,
  GENDERS,
  HAND_LABELS,
  HANDS,
  SIDE_LABELS,
  SIDES,
  type Gender,
  type Hand,
  type Side,
} from '@/lib/domain/profile'

export type ProfileValues = {
  displayName: string
  side: Side | null
  hand: Hand | null
  gender: Gender | null
  category: number | null
  isPublic: boolean
}

// The welcome form (mode "onboarding") and the profile screen share it.
export function PlayerProfileForm({
  mode,
  action,
  initial,
  next,
}: {
  mode: 'onboarding' | 'profile'
  action: FormAction
  initial: ProfileValues
  next?: string
}) {
  const onboarding = mode === 'onboarding'

  return (
    <ActionForm action={action} submitLabel={onboarding ? 'Guardar y seguir' : 'Guardar cambios'}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Nombre" htmlFor="displayName">
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          autoComplete="name"
          defaultValue={initial.displayName}
          className={inputClasses}
        />
      </Field>
      <Field label="Lado" htmlFor="side">
        <select id="side" name="side" required defaultValue={initial.side ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu lado
          </option>
          {SIDES.map((side) => (
            <option key={side} value={side}>
              {SIDE_LABELS[side]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mano" htmlFor="hand">
        <select id="hand" name="hand" required defaultValue={initial.hand ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu mano
          </option>
          {HANDS.map((hand) => (
            <option key={hand} value={hand}>
              {HAND_LABELS[hand]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Género" htmlFor="gender">
        <select id="gender" name="gender" required defaultValue={initial.gender ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu género
          </option>
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {GENDER_LABELS[gender]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Categoría" htmlFor="category">
        <select id="category" name="category" required defaultValue={initial.category ?? ''} className={inputClasses}>
          <option value="" disabled>
            Elegí tu categoría
          </option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}ª
            </option>
          ))}
        </select>
      </Field>
      <p className="text-sm text-fg-muted">
        {onboarding
          ? 'El club valida tu categoría. Hasta entonces figura como pendiente.'
          : 'Si cambiás la categoría, el club la vuelve a validar.'}
      </p>
      {onboarding ? (
        <p className="text-sm text-fg-muted">
          El género define a qué partidos masculinos o femeninos te podés sumar. A los mixtos se suma cualquiera.
        </p>
      ) : null}
      {onboarding ? (
        <input type="hidden" name="isPublic" value="on" />
      ) : (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} className="size-5 accent-accent" />
          Otros jugadores pueden ver mi perfil
        </label>
      )}
    </ActionForm>
  )
}
