'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'

export function PreferredCourtsForm({
  action,
  courts,
  selected,
}: {
  action: FormAction
  courts: { id: string; name: string }[]
  selected: string[]
}) {
  const checked = new Set(selected)
  return (
    <ActionForm action={action} submitLabel="Guardar canchas" variant="secondary">
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Canchas preferidas</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="courtIds"
              value={court.id}
              defaultChecked={checked.has(court.id)}
              className="size-5 accent-accent"
            />
            {court.name}
          </label>
        ))}
      </fieldset>
    </ActionForm>
  )
}
