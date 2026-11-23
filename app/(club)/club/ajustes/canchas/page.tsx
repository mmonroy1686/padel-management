import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { createClient } from '@/lib/supabase/server'
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateCourt } from '../actions'
import { CourtsTable, PricesTable } from '../settings-tables'
import { TimeSelect } from '../time-select'

export const metadata: Metadata = { title: 'Ajustes · Canchas y precios' }

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

// Ajustes → Canchas y precios: what can be booked and what each slot costs.
export default async function CourtsSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/canchas')
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name, is_covered, is_active').eq('club_id', club.id).order('sort_order'),
    supabase.from('pricing_rules').select('id, weekdays, from_time, to_time, price').eq('club_id', club.id).order('from_time'),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error

  return (
    <>
      <SettingsHeader href="/club/ajustes/canchas" />
      <SettingsBlock id="canchas" title="Canchas" card={false}>
        <CourtsTable courts={courts.data} updateAction={updateCourt} deleteAction={deleteCourt} />
        <Card>
          <ActionForm action={addCourt} submitLabel="Agregar cancha" variant="secondary">
            <input type="hidden" name="sortOrder" value={courts.data.length + 1} />
            <Field label="Nombre de la cancha nueva" htmlFor="new-court">
              <input id="new-court" name="name" required maxLength={40} className={inputClasses} />
            </Field>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="is_covered" className="size-5 accent-accent" />
              Techada
            </label>
          </ActionForm>
        </Card>
      </SettingsBlock>
      <SettingsBlock
        id="precios"
        title="Precios por franja"
        description="El precio de un turno sale de la franja que cubre su hora de inicio. Un turno sin franja no se ofrece."
        card={false}
      >
        <PricesTable rules={rules.data} deleteAction={deletePricingRule} />
        <Card>
          <ActionForm action={addPricingRule} submitLabel="Agregar precio" variant="secondary">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="mb-1 text-sm font-semibold">Días</legend>
              {MONDAY_FIRST.map((day) => (
                <label key={day} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="weekdays" value={day} className="size-5 accent-accent" />
                  {WEEKDAYS_SHORT[day]}
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde" htmlFor="from_time">
                <TimeSelect id="from_time" name="from_time" value="18:30" />
              </Field>
              <Field label="Hasta" htmlFor="to_time">
                <TimeSelect id="to_time" name="to_time" value="24:00" />
              </Field>
            </div>
            <Field label="Precio en pesos" htmlFor="price">
              <input id="price" name="price" type="number" inputMode="numeric" min={0} required className={inputClasses} />
            </Field>
          </ActionForm>
        </Card>
      </SettingsBlock>
    </>
  )
}
