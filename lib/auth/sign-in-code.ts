// The 6-digit code of the sign-in mail. People paste it with spaces ("123 456") or type it with them.
export const SIGN_IN_CODE_LENGTH = 6

export function parseSignInCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\s+/g, '')
  return new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`).test(digits) ? digits : null
}

// Why the code did not sign in, from GoTrue's error code. A wrong code and an old one look the same to GoTrue.
export function signInCodeErrorMessage(code: string | undefined): string {
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Probaste muchas veces. Esperá unos minutos y pedí otro código.'
  }
  if (code === 'otp_expired' || code === 'invalid_credentials' || code === 'otp_disabled') {
    return 'El código no es correcto o venció. Revisalo o pedí otro.'
  }
  return 'No pudimos entrar con ese código. Probá de nuevo en un minuto.'
}
