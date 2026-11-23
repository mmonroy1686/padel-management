import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { SLOT_LENGTHS } from '@/lib/domain/settings'
import { updateBookingSettings } from '../actions'
import { hhmm, TimeSelect } from '../time-select'

export const metadata: Metadata = { title: 'Ajustes · Reservas y partidos' }

// Ajustes → Reservas y partidos: one form (one save) in three groups, so each rule is next to the ones it goes with.
export default async function BookingSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/reservas')
  return (
    <>
      <SettingsHeader href="/club/ajustes/reservas" />
      <SettingsBlock id="reglas" title="Reglas" description="Los cambios no tocan las reservas ya hechas.">
        <ActionForm action={updateBookingSettings} submitLabel="Guardar reglas">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">Horario</legend>
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
          </fieldset>
          <hr className="border-border" />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">Reservas</legend>
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
          </fieldset>
          <hr className="border-border" />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">Partidos abiertos</legend>
            <Field label="Minutos antes para cerrar partidos incompletos" htmlFor="match_close_minutes">
              <input id="match_close_minutes" name="match_close_minutes" type="number" min={0} max={2880} step={5}
                defaultValue={club.match_close_minutes} aria-describedby="match_close_help" className={`${inputClasses} sm:max-w-48`} />
            </Field>
            <p id="match_close_help" className="text-sm text-fg-muted">
              Si a esa altura el partido no tiene los 4, se cancela solo y nadie paga. Con 30, se pueden sumar hasta media
              hora antes.
            </p>
          </fieldset>
        </ActionForm>
      </SettingsBlock>
    </>
  )
}
