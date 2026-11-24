import { describe, expect, it, vi } from 'vitest'
import { sendTestError, testErrorMessage, type SentryLike } from '@/lib/observability/sentry-check'

function sentry(overrides: Partial<SentryLike> = {}): SentryLike {
  return {
    getClient: () => ({}),
    captureException: vi.fn(() => 'abc123'),
    flush: vi.fn(async () => true),
    ...overrides,
  }
}

describe('sendTestError', () => {
  it('sends a test error from where it runs and gives its event id', async () => {
    const client = sentry()
    const result = await sendTestError(client, 'servidor')
    expect(result).toEqual({ ok: true, eventId: 'abc123' })
    const [error, context] = vi.mocked(client.captureException).mock.calls[0]
    expect((error as Error).message).toBe('Prueba de monitoreo (servidor)')
    expect(context).toEqual({ tags: { monitoring_check: 'servidor' } })
    expect(client.flush).toHaveBeenCalledWith(5000)
  })

  it('says Sentry is off when there is no client (no DSN)', async () => {
    const client = sentry({ getClient: () => undefined })
    expect(await sendTestError(client, 'navegador')).toEqual({ ok: false, reason: 'off' })
    expect(client.captureException).not.toHaveBeenCalled()
  })

  it('says the event did not go out when flush times out', async () => {
    const client = sentry({ flush: async () => false })
    expect(await sendTestError(client, 'servidor')).toEqual({ ok: false, reason: 'not_sent' })
  })
})

describe('testErrorMessage', () => {
  it('tells the admin where to find it, or why it did not go', () => {
    expect(testErrorMessage({ ok: true, eventId: 'abc123' })).toBe(
      'Enviado. En Sentry → Issues buscá «Prueba de monitoreo» o el ID abc123.',
    )
    expect(testErrorMessage({ ok: false, reason: 'off' })).toBe(
      'Sentry está apagado acá: falta NEXT_PUBLIC_SENTRY_DSN en Vercel (y volver a desplegar).',
    )
    expect(testErrorMessage({ ok: false, reason: 'not_sent' })).toBe(
      'No llegó a enviarse a tiempo. Revisá la conexión o un bloqueador de anuncios y probá de nuevo.',
    )
  })
})
