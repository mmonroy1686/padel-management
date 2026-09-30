import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { DAY_USE_DEFAULTS, type DayUseProduct } from '@/lib/domain/day-use'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { TIME_OPTIONS } from '@/lib/domain/settings'

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

function TimeSelect({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <select id={id} name={name} defaultValue={value} className={inputClasses}>
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  )
}

// Design: "Configuración", create or edit a pass. With no weekday it only runs on the dates the
// calendar opens; with no court it blocks none.
export function ProductForm({
  product,
  courts,
  action,
  idPrefix,
}: {
  product: DayUseProduct | null
  courts: { id: string; name: string }[]
  action: FormAction
  idPrefix: string
}) {
  const includes: readonly string[] = product?.includes ?? DAY_USE_DEFAULTS.includes
  const weekdays: readonly number[] = product?.weekdays ?? DAY_USE_DEFAULTS.weekdays
  const courtIds: readonly string[] = product?.courtIds ?? []
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <ActionForm action={action} submitLabel={product ? 'Guardar pase' : 'Crear pase'} variant={product ? 'secondary' : 'primary'}>
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="sortOrder" value={product?.sortOrder ?? 0} />
      <Field label="Nombre" htmlFor={id('name')}>
        <input id={id('name')} name="name" required maxLength={60} defaultValue={product?.name ?? DAY_USE_DEFAULTS.name} className={inputClasses} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio" htmlFor={id('price')}>
          <input id={id('price')} name="price" type="number" inputMode="numeric" min={0} required
            defaultValue={product?.price ?? DAY_USE_DEFAULTS.price} className={inputClasses} />
        </Field>
        <Field label="Cupo por día" htmlFor={id('capacity')}>
          <input id={id('capacity')} name="capacity" type="number" inputMode="numeric" min={1} max={500} required
            defaultValue={product?.capacity ?? DAY_USE_DEFAULTS.capacity} className={inputClasses} />
        </Field>
      </div>
      <Field label="Qué incluye (separado por comas)" htmlFor={id('includes')}>
        <input id={id('includes')} name="includes" maxLength={400} defaultValue={includes.join(', ')}
          placeholder="Vestuarios, pileta, cancha libre" className={inputClasses} />
      </Field>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-semibold">Días</legend>
        {MONDAY_FIRST.map((day) => (
          <label key={day} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="weekdays" value={day} defaultChecked={weekdays.includes(day)} className="size-5 accent-accent" />
            {WEEKDAYS_SHORT[day]}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor={id('from')}>
          <TimeSelect id={id('from')} name="fromTime" value={product?.fromTime ?? DAY_USE_DEFAULTS.fromTime} />
        </Field>
        <Field label="Hasta" htmlFor={id('to')}>
          <TimeSelect id={id('to')} name="toTime" value={product?.toTime ?? DAY_USE_DEFAULTS.toTime} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Canchas que bloquea</legend>
        {courts.map((court) => (
          <label key={court.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="courtIds" value={court.id} defaultChecked={courtIds.includes(court.id)} className="size-5 accent-accent" />
            {court.name}
          </label>
        ))}
        <p className="text-sm text-fg-muted">
          Sin canchas marcadas no se bloquea ninguna. Si una ya está ocupada ese día, se saltea y aparece en los avisos.
        </p>
      </fieldset>
    </ActionForm>
  )
}
