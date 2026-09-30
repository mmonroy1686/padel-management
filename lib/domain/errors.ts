// Stable codes raised by the database functions (private.fail) and their Spanish text.
const MESSAGES = {
  slot_taken: 'Esa cancha se acaba de ocupar. Elegí otro horario.',
  not_aligned: 'Ese horario no coincide con los turnos del club.',
  in_the_past: 'Ese turno ya pasó.',
  outside_window: 'Todavía no se puede reservar para esa fecha.',
  notice_period: 'Ya no se puede cancelar: el plazo de aviso terminó. Avisá al club.',
  no_price: 'Ese turno no tiene precio cargado. Consultá en el club.',
  too_many_bookings: 'Llegaste al máximo de reservas activas. Cancelá una o esperá a jugarla.',
  busy_at_that_time: 'Ya tenés una reserva o un partido a esa hora.',
  receipt_required: 'Subí el comprobante de la transferencia.',
  forbidden: 'No tenés permiso para hacer eso.',
  not_found: 'No encontramos lo que buscabas. Puede que ya no exista.',
  invalid_state: 'Eso ya no se puede hacer: cambió mientras tanto. Recargá la página.',
  invalid_input: 'Revisá los datos ingresados.',
  method_disabled: 'El club no acepta ese medio de pago.',
  category_mismatch: 'Tu categoría no entra en la de este partido.',
  type_mismatch: 'Este partido es para otro género. A los mixtos se suma cualquiera.',
  side_mismatch: 'Ese lugar es para el otro lado de la cancha.',
  match_closed: 'El partido ya no está abierto: se completó, se canceló o llegó la hora de cierre.',
  already_in_match: 'Ya estás en este partido.',
  spot_taken: 'Ese lugar se acaba de ocupar. Elegí otro.',
  already_paid: 'Ya pagaste tu parte: pedile al club que te saque del partido y te devuelva el pago.',
} as const

export type ErrorCode = keyof typeof MESSAGES

export const FALLBACK_MESSAGE = 'Algo salió mal. Probá de nuevo en un momento.'

export function isErrorCode(value: string): value is ErrorCode {
  // hasOwn so "constructor" does not pick up Object.prototype.
  return Object.hasOwn(MESSAGES, value)
}

export function errorMessage(raw: string | null | undefined): string {
  const code = raw?.trim() ?? ''
  return isErrorCode(code) ? MESSAGES[code] : FALLBACK_MESSAGE
}
