'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { availabilityKey, DAY_BAND_LABELS, DAY_BANDS } from '@/lib/domain/availability'
import { WEEKDAYS_LONG } from '@/lib/domain/format'

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

// "Cuándo solés poder jugar": feeds "Partidos para vos" and the suggestions. Only the player sees it.
export function AvailabilityForm({ action, selected }: { action: FormAction; selected: string[] }) {
  const checked = new Set(selected)
  return (
    <ActionForm action={action} submitLabel="Guardar horarios" variant="secondary">
      <table className="w-full text-sm">
        <caption className="sr-only">Días y franjas en que solés poder jugar</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Día</span>
            </th>
            {DAY_BANDS.map((band) => (
              <th key={band} scope="col" className="font-semibold">
                {DAY_BAND_LABELS[band]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONDAY_FIRST.map((weekday) => (
            <tr key={weekday}>
              <th scope="row" className="py-1 text-left font-normal">
                {capitalize(WEEKDAYS_LONG[weekday])}
              </th>
              {DAY_BANDS.map((band) => (
                <td key={band} className="text-center">
                  <input
                    type="checkbox"
                    name="availability"
                    value={availabilityKey(weekday, band)}
                    defaultChecked={checked.has(availabilityKey(weekday, band))}
                    aria-label={`${capitalize(WEEKDAYS_LONG[weekday])}, ${DAY_BAND_LABELS[band].toLowerCase()}`}
                    className="size-5 accent-accent"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ActionForm>
  )
}
