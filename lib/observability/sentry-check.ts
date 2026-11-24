// Ajustes → Monitoreo: an admin sends a test error from the server and from the browser and finds it in Sentry. The
// Sentry SDK is passed in, so the server action and the browser button share this and the tests need no network.

export type CheckPlace = 'servidor' | 'navegador'
export type SentryLike = {
  getClient: () => unknown
  captureException: (error: unknown, context: { tags: Record<string, string> }) => string
  flush: (timeout: number) => PromiseLike<boolean>
}
export type TestErrorResult = { ok: true; eventId: string } | { ok: false; reason: 'off' | 'not_sent' }

const FLUSH_MS = 5000

export async function sendTestError(sentry: SentryLike, place: CheckPlace): Promise<TestErrorResult> {
  // No client: Sentry.init never ran because there is no DSN.
  if (!sentry.getClient()) return { ok: false, reason: 'off' }
  const eventId = sentry.captureException(new Error(`Prueba de monitoreo (${place})`), {
    tags: { monitoring_check: place },
  })
  return (await sentry.flush(FLUSH_MS)) ? { ok: true, eventId } : { ok: false, reason: 'not_sent' }
}

export function testErrorMessage(result: TestErrorResult): string {
  if (result.ok) return `Enviado. En Sentry → Issues buscá «Prueba de monitoreo» o el ID ${result.eventId}.`
  return result.reason === 'off'
    ? 'Sentry está apagado acá: falta NEXT_PUBLIC_SENTRY_DSN en Vercel (y volver a desplegar).'
    : 'No llegó a enviarse a tiempo. Revisá la conexión o un bloqueador de anuncios y probá de nuevo.'
}
