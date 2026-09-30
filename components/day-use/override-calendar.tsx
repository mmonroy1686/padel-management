'use client'

import { useCallback, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { isOpenOn, type DayUseOverride, type DayUseProduct } from '@/lib/domain/day-use'
import type { LocalDate } from '@/lib/domain/time'

export type CalendarDay = { date: LocalDate; label: string }

// Design: "Configuración", the calendar of the coming days. Each cell opens or closes that date
// only (set_day_use_override); the weekly rule stays as it is.
export function OverrideCalendar({
  products,
  days,
  overrides,
  action,
}: {
  products: DayUseProduct[]
  days: CalendarDay[]
  overrides: DayUseOverride[]
  action: FormAction
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const done = useCallback((message: string) => setNotice(message), [])

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4">
        <table aria-label="Calendario de day use" className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3 text-left">
                Pase
              </th>
              {days.map((day) => (
                <th key={day.date} scope="col" className="px-1 py-2 text-center font-semibold">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {product.name}
                </th>
                {days.map((day) => {
                  const open = isOpenOn(product, day.date, overrides)
                  const exception = overrides.some((item) => item.productId === product.id && item.date === day.date)
                  return (
                    <td key={day.date} className="px-1 py-2 align-top">
                      <ActionForm
                        action={action}
                        submitLabel={open ? 'Abierto' : 'Cerrado'}
                        pendingLabel="…"
                        variant={open ? 'primary' : 'secondary'}
                        onDone={done}
                      >
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="date" value={day.date} />
                        <input type="hidden" name="enabled" value={open ? 'false' : 'true'} />
                      </ActionForm>
                      {exception ? <span className="mt-1 block text-center text-xs text-accent-ink">Excepción</span> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-fg-muted">Tocá un día para abrirlo o cerrarlo solo esa fecha. Los pases ya vendidos siguen valiendo.</p>
    </div>
  )
}
