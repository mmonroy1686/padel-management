'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { SeedPair } from '@/lib/domain/championship-views'

// Design: "Cabezas de serie": the pairs strongest first (lowest sum of declared categories); the organizer numbers
// the ones to fix (1, 2...), one per group, before the draw.
export function SeedsForm({ categoryId, pairs, action }: { categoryId: string; pairs: SeedPair[]; action: FormAction }) {
  return (
    <ActionForm action={action} submitLabel="Guardar cabezas de serie" pendingLabel="Guardando…" variant="secondary">
      <input type="hidden" name="categoryId" value={categoryId} />
      <ul className="flex flex-col gap-2">
        {pairs.map((pair) => (
          <li key={pair.id} className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">{pair.name}</span>
              <span className="block text-sm text-fg-muted">{pair.levels}</span>
            </span>
            <label htmlFor={`seed-${pair.id}`} className="sr-only">
              {`Cabeza de serie de ${pair.name}`}
            </label>
            <select
              id={`seed-${pair.id}`}
              name={`seed:${pair.id}`}
              defaultValue={pair.seed === null ? '' : String(pair.seed)}
              className={cn(inputClasses, 'w-24')}
            >
              <option value="">—</option>
              {pairs.map((_, index) => (
                <option key={index} value={String(index + 1)}>
                  {index + 1}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </ActionForm>
  )
}
