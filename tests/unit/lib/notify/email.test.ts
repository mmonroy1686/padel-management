// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { emailSenderFromEnv, resendSender } from '@/lib/notify/email'

const MESSAGE = { to: 'ana@test.local', subject: 'Se liberó tu turno', html: '<p>Hola</p>', text: 'Hola' }

describe('resendSender', () => {
  it('posts the mail to Resend with the key and the sender', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200 }) as Response)
    await resendSender({ apiKey: 're_test', from: 'Rustic <avisos@rustic.test>', fetchImpl })(MESSAGE)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'Bearer re_test', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Rustic <avisos@rustic.test>',
      to: ['ana@test.local'],
      subject: 'Se liberó tu turno',
      html: '<p>Hola</p>',
      text: 'Hola',
    })
  })

  it('throws when Resend does not take it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ({ ok: false, status: 422 }) as Response)
    await expect(resendSender({ apiKey: 're_test', from: 'a@b.test', fetchImpl })(MESSAGE)).rejects.toThrow(
      'Resend respondió 422',
    )
  })
})

describe('emailSenderFromEnv', () => {
  it('needs both the key and the sender address', () => {
    expect(emailSenderFromEnv({})).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_test' })).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: ' ', EMAIL_FROM: 'Rustic <a@b.test>' })).toBeNull()
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'Rustic <a@b.test>' })).toEqual(expect.any(Function))
  })
})
