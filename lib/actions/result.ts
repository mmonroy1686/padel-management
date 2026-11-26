import { errorMessage } from '@/lib/domain/errors'

// What a Server Action returns to its form: shown in place, without closing the sheet.
// paymentIds: a desk charge says which payments it made, so the screen can offer "Deshacer" (void_desk_payment).
export type ActionState = { status: 'idle' | 'ok' | 'error'; message?: string; paymentIds?: string[] }

export const IDLE: ActionState = { status: 'idle' }

export function ok(message: string): ActionState {
  return { status: 'ok', message }
}

export function failed(message: string): ActionState {
  return { status: 'error', message }
}

export const INVALID_INPUT: ActionState = failed(errorMessage('invalid_input'))

// Supabase puts the code raised by private.fail in error.message.
export function fromRpc(error: { message: string } | null, okMessage: string): ActionState {
  return error ? failed(errorMessage(error.message)) : ok(okMessage)
}

// The assistant's "Crear partido": the state also carries the new match, so the sheet moves on to inviting.
export type CreatedState = ActionState & { matchId?: string }
export type CreateMatchAction = (previous: CreatedState, form: FormData) => Promise<CreatedState>
// The assistant's "Invitar": called with arguments, not a form, from the invite list.
export type InviteResult = { ok: true; invited: number } | { ok: false; message: string }
export type InviteAction = (matchId: string, playerIds: string[]) => Promise<InviteResult>
