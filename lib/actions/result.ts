import { errorMessage } from '@/lib/domain/errors'

// What a Server Action returns to its form: shown in place, without closing the sheet.
export type ActionState = { status: 'idle' | 'ok' | 'error'; message?: string }

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
