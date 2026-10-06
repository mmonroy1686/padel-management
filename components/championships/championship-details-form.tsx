import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { MAX_CATEGORIES_DEFAULT } from '@/lib/domain/championships'
import { TIME_OPTIONS } from '@/lib/domain/settings'

export type ChampionshipDetails = {
  id: string
  name: string
  rules: string
  maxCategories: number
  // On the club's clock; empty when there is no deadline yet.
  closesDate: string
  closesTime: string
}

// Design: "Crear o editar": name, rules, how many categories a player may play, and until when people sign up
// (empty: 24 hours before the first match).
export function ChampionshipDetailsForm({
  action,
  submitLabel,
  pendingLabel,
  today,
  details,
}: {
  action: FormAction
  submitLabel: string
  pendingLabel: string
  today: string
  details?: ChampionshipDetails
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel={pendingLabel}>
      {details ? <input type="hidden" name="championshipId" value={details.id} /> : null}
      <Field label="Nombre" htmlFor="championship-name">
        <input
          id="championship-name"
          name="name"
          required
          maxLength={80}
          defaultValue={details?.name}
          placeholder="Campeonato de Primavera"
          className={inputClasses}
        />
      </Field>
      <Field label="Reglamento" htmlFor="championship-rules">
        <textarea
          id="championship-rules"
          name="rules"
          rows={5}
          maxLength={5000}
          defaultValue={details?.rules}
          className={cn(inputClasses, 'py-2')}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Categorías por jugador" htmlFor="championship-max">
          <select
            id="championship-max"
            name="maxCategories"
            defaultValue={details?.maxCategories ?? MAX_CATEGORIES_DEFAULT}
            className={inputClasses}
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cierre de inscripción" htmlFor="championship-closes-date">
          <input
            id="championship-closes-date"
            name="closesDate"
            type="date"
            min={today}
            defaultValue={details?.closesDate}
            className={inputClasses}
          />
        </Field>
        <Field label="Hora del cierre" htmlFor="championship-closes-time">
          <select id="championship-closes-time" name="closesTime" defaultValue={details?.closesTime ?? ''} className={inputClasses}>
            <option value="">—</option>
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-sm text-fg-muted">Sin cierre, la inscripción cierra 24 horas antes del primer partido.</p>
    </ActionForm>
  )
}
