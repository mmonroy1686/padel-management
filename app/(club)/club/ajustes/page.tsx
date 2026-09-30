import type { Metadata } from 'next'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { describeRule, SLOT_LENGTHS, TIME_OPTIONS } from '@/lib/domain/settings'
import { formatMinutes, parseTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'
import { addCourt, addPricingRule, deletePricingRule, updateClubSettings, updateCourt } from './actions'

export const metadata: Metadata = { title: 'Ajustes' }

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const hhmm = (value: string) => formatMinutes(parseTime(value))

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

export default async function SettingsPage() {
  const viewer = await requireAdmin('/club/ajustes')
  const { club } = viewer
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name, is_covered, is_active').eq('club_id', club.id).order('sort_order'),
    supabase.from('pricing_rules').select('id, weekdays, from_time, to_time, price').eq('club_id', club.id).order('from_time'),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error

  return (
    <>
      <section aria-labelledby="club" className="flex flex-col gap-3">
        <h2 id="club" className="font-display text-2xl font-bold uppercase">
          Horario y reglas
        </h2>
        <Card>
          <ActionForm action={updateClubSettings} submitLabel="Guardar ajustes">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Abre" htmlFor="opens_at">
                <TimeSelect id="opens_at" name="opens_at" value={hhmm(club.opens_at)} />
              </Field>
              <Field label="Cierra" htmlFor="closes_at">
                <TimeSelect id="closes_at" name="closes_at" value={hhmm(club.closes_at)} />
              </Field>
              <Field label="Duración del turno" htmlFor="slot_minutes">
                <select id="slot_minutes" name="slot_minutes" defaultValue={club.slot_minutes} className={inputClasses}>
                  {SLOT_LENGTHS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutos
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Días para reservar por adelantado" htmlFor="booking_window_days">
                <input id="booking_window_days" name="booking_window_days" type="number" min={1} max={60}
                  defaultValue={club.booking_window_days} className={inputClasses} />
              </Field>
              <Field label="Horas de aviso para cancelar" htmlFor="cancellation_notice_hours">
                <input id="cancellation_notice_hours" name="cancellation_notice_hours" type="number" min={0} max={72}
                  defaultValue={club.cancellation_notice_hours} className={inputClasses} />
              </Field>
              <Field label="Reservas activas por jugador" htmlFor="max_active_bookings">
                <input id="max_active_bookings" name="max_active_bookings" type="number" min={1} max={10}
                  defaultValue={club.max_active_bookings} className={inputClasses} />
              </Field>
              <Field label="Horas antes para cerrar partidos incompletos" htmlFor="match_close_hours">
                <input id="match_close_hours" name="match_close_hours" type="number" min={0} max={48}
                  defaultValue={club.match_close_hours} className={inputClasses} />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Medios de pago</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="accepts_cash" defaultChecked={club.accepts_cash} className="size-5 accent-accent" />
                Efectivo en el club
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="accepts_transfer" defaultChecked={club.accepts_transfer} className="size-5 accent-accent" />
                Transferencia
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="transfer_receipt_required" defaultChecked={club.transfer_receipt_required}
                  className="size-5 accent-accent" />
                Pedir comprobante de la transferencia
              </label>
            </fieldset>
            <Field label="Datos para transferir" htmlFor="transfer_details">
              <textarea id="transfer_details" name="transfer_details" rows={3} maxLength={500}
                defaultValue={club.transfer_details ?? ''} className={`${inputClasses} py-2`} />
            </Field>
            <p className="text-sm text-fg-muted">Los cambios no tocan las reservas ya hechas.</p>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="canchas" className="flex flex-col gap-3">
        <h2 id="canchas" className="font-display text-2xl font-bold uppercase">
          Canchas
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {courts.data.map((court) => (
            <li key={court.id}>
              <Card>
                <ActionForm action={updateCourt} submitLabel="Guardar cancha" variant="secondary">
                  <input type="hidden" name="courtId" value={court.id} />
                  <Field label="Nombre" htmlFor={`court-${court.id}`}>
                    <input id={`court-${court.id}`} name="name" required maxLength={40} defaultValue={court.name}
                      className={inputClasses} />
                  </Field>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="is_covered" defaultChecked={court.is_covered} className="size-5 accent-accent" />
                    Techada
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="is_active" defaultChecked={court.is_active} className="size-5 accent-accent" />
                    Activa (se ofrece para reservar)
                  </label>
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
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
      </section>

      <section aria-labelledby="precios" className="flex flex-col gap-3">
        <h2 id="precios" className="font-display text-2xl font-bold uppercase">
          Precios por franja
        </h2>
        <p className="text-sm text-fg-muted">
          El precio de un turno sale de la franja que cubre su hora de inicio. Un turno sin franja no se ofrece.
        </p>
        <ul className="flex flex-col gap-2">
          {rules.data.map((rule) => (
            <li key={rule.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {describeRule({ weekdays: rule.weekdays, fromTime: rule.from_time, toTime: rule.to_time, price: rule.price })}
                </span>
                <ActionForm action={deletePricingRule} submitLabel="Borrar" variant="ghost">
                  <input type="hidden" name="ruleId" value={rule.id} />
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
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
      </section>
    </>
  )
}
