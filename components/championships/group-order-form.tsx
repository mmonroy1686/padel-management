'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'

// Design: "si persiste, sorteo del organizador desde la app": a complete group that did not close by itself is
// ordered here (it starts in the order of its table) and closed; its places go to the bracket.
export function GroupOrderForm({
  groupId,
  rows,
  tiedNames,
  action,
}: {
  groupId: string
  rows: { entryId: string; name: string }[]
  tiedNames: string[]
  action: FormAction
}) {
  return (
    <ActionForm action={action} submitLabel="Cerrar zona" pendingLabel="Cerrando…" variant="secondary">
      <p className="text-sm">
        {tiedNames.length > 0
          ? 'Hay un empate que decide el organizador (por sorteo): ordená la zona y cerrala.'
          : 'Todos sus partidos tienen resultado: revisá el orden y cerrá la zona.'}
      </p>
      <input type="hidden" name="groupId" value={groupId} />
      {rows.map((row, index) => (
        <div key={row.entryId} className="flex items-center justify-between gap-3">
          <label htmlFor={`place-${groupId}-${row.entryId}`} className="text-sm">
            {`Puesto de ${row.name}`}
          </label>
          <select
            id={`place-${groupId}-${row.entryId}`}
            name={`place:${row.entryId}`}
            defaultValue={String(index + 1)}
            className={cn(inputClasses, 'w-20')}
          >
            {rows.map((_, place) => (
              <option key={place} value={String(place + 1)}>
                {place + 1}
              </option>
            ))}
          </select>
        </div>
      ))}
    </ActionForm>
  )
}
