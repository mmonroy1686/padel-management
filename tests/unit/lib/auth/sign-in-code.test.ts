import { describe, expect, it } from 'vitest'
import { parseSignInCode, signInCodeErrorMessage } from '@/lib/auth/sign-in-code'

describe('the sign-in code', () => {
  it('takes six digits, with or without spaces', () => {
    expect(parseSignInCode('123456')).toBe('123456')
    expect(parseSignInCode(' 123 456 ')).toBe('123456')
  })

  it('refuses anything else', () => {
    expect(parseSignInCode('12345')).toBeNull()
    expect(parseSignInCode('1234567')).toBeNull()
    expect(parseSignInCode('12a456')).toBeNull()
    expect(parseSignInCode(null)).toBeNull()
  })

  it('says why it did not work', () => {
    expect(signInCodeErrorMessage('otp_expired')).toMatch(/no es correcto o venció/)
    expect(signInCodeErrorMessage('over_request_rate_limit')).toMatch(/Probaste muchas veces/)
    expect(signInCodeErrorMessage(undefined)).toMatch(/Probá de nuevo/)
  })
})
