import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import type { Club } from '@/lib/auth/viewer'
import { WEEKDAYS_SHORT } from '@/lib/domain/format'
import { SLOT_LENGTHS } from '@/lib/domain/settings'
import { STAFF_ROLE_LABELS, STAFF_ROLES } from '@/lib/domain/staff'
import {
  addCourt,
  addPricingRule,
  deleteCourt,
  deletePricingRule,
  updateBookingSettings,
  updateCourt,
  updatePaymentSettings,
} from './actions'
import { CourtsTable, PricesTable, type CourtRow, type PriceRow } from './settings-tables'
import { inviteStaff } from './staff/actions'
import { hhmm, TimeSelect } from './time-select'

// The forms of Ajustes, shared with the setup assistant (/club/alta): a fix in one is a fix in both.

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

// "Reservas y partidos": one form (one save) in three groups, so each rule is next to the ones it goes with.
export function BookingRulesForm({ club }: { club: Club }) {
  return (
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
  )
}

// "Pagos": how players pay, and what they see when they transfer.
export function PaymentsForm({ club }: { club: Club }) {
  return (
    <ActionForm action={updatePaymentSettings} submitLabel="Guardar pagos">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Cómo te pagan</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="accepts_cash" defaultChecked={club.accepts_cash} className="size-5 accent-accent" />
          Efectivo en el club
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="accepts_card" defaultChecked={club.accepts_card} className="size-5 accent-accent" />
          POS (tarjeta en recepción)
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
        <textarea id="transfer_details" name="transfer_details" rows={4} maxLength={500} aria-describedby="transfer_help"
          defaultValue={club.transfer_details ?? ''} className={`${inputClasses} py-2`} />
      </Field>
      <p id="transfer_help" className="text-sm text-fg-muted">Banco, cuenta y titular: se los mostramos al que elige transferir.</p>
    </ActionForm>
  )
}

// "Canchas": the list, each editable, and the form for a new one.
export function CourtsEditor({ courts }: { courts: CourtRow[] }) {
  return (
    <>
      <CourtsTable courts={courts} updateAction={updateCourt} deleteAction={deleteCourt} />
      <Card>
        <ActionForm action={addCourt} submitLabel="Agregar cancha" variant="secondary">
          <input type="hidden" name="sortOrder" value={courts.length + 1} />
          <Field label="Nombre de la cancha nueva" htmlFor="new-court">
            <input id="new-court" name="name" required maxLength={40} className={inputClasses} />
          </Field>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="is_covered" className="size-5 accent-accent" />
            Techada
          </label>
        </ActionForm>
      </Card>
    </>
  )
}

// "Precios por franja": the bands, and the form for a new one.
export function PricesEditor({ rules }: { rules: PriceRow[] }) {
  return (
    <>
      <PricesTable rules={rules} deleteAction={deletePricingRule} />
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
    </>
  )
}

// "Staff → Invitar": an email and its role.
export function InviteStaffForm() {
  return (
    <ActionForm action={inviteStaff} submitLabel="Invitar" pendingLabel="Invitando…">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Email" htmlFor="invite-email">
          <input id="invite-email" name="email" type="email" required autoComplete="off" className={inputClasses} />
        </Field>
        <Field label="Rol" htmlFor="invite-role">
          <select id="invite-role" name="role" defaultValue="reception" className={inputClasses}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </ActionForm>
  )
}
