import { describe, expect, it } from 'vitest'
import { failed, fromRpc, IDLE, INVALID_INPUT, ok } from '@/lib/actions/result'
import { errorMessage } from '@/lib/domain/errors'

describe('action results', () => {
  it('starts idle', () => {
    expect(IDLE).toEqual({ status: 'idle' })
  })

  it('turns an RPC error into its Spanish message', () => {
    expect(fromRpc({ message: 'slot_taken' }, 'Reservado')).toEqual({ status: 'error', message: errorMessage('slot_taken') })
  })

  it('returns the success message when the RPC worked', () => {
    expect(fromRpc(null, 'Reservado')).toEqual({ status: 'ok', message: 'Reservado' })
  })

  it('has helpers for the other outcomes', () => {
    expect(ok('Listo')).toEqual({ status: 'ok', message: 'Listo' })
    expect(failed('Mal')).toEqual({ status: 'error', message: 'Mal' })
    expect(INVALID_INPUT).toEqual({ status: 'error', message: errorMessage('invalid_input') })
  })
})
