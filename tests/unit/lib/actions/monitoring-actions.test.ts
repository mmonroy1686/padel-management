import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const sentry = vi.hoisted(() => ({
  getClient: vi.fn<() => unknown>(() => ({})),
  captureException: vi.fn(() => 'evt42'),
  flush: vi.fn(async () => true),
}))

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => sentry)
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: 'a0000000-0000-0000-0000-000000000001' }, membership: { role: state.role } }),
}))

const { sendServerTestError } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')

beforeEach(() => {
  state.role = 'admin'
  sentry.getClient.mockReturnValue({})
  sentry.captureException.mockClear()
})

describe('sendServerTestError', () => {
  it('sends a test error from the server and gives its id', async () => {
    expect(await sendServerTestError()).toEqual({
      status: 'ok',
      message: 'Enviado. En Sentry → Issues buscá «Prueba de monitoreo» o el ID evt42.',
    })
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('says when Sentry is off on the server', async () => {
    sentry.getClient.mockReturnValue(undefined)
    expect(await sendServerTestError()).toEqual({
      status: 'error',
      message: 'Sentry está apagado acá: falta NEXT_PUBLIC_SENTRY_DSN en Vercel (y volver a desplegar).',
    })
  })

  it('lets only admins send it', async () => {
    state.role = 'reception'
    expect(await sendServerTestError()).toEqual({ status: 'error', message: errorMessage('forbidden') })
    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
