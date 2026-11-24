'use client'

import * as Sentry from '@sentry/nextjs'
import { ActionForm } from '@/components/ui/action-form'
import { failed, ok, type ActionState } from '@/lib/actions/result'
import { sendTestError, testErrorMessage } from '@/lib/observability/sentry-check'

// Ajustes → Monitoreo: the same test error, sent from this browser (the browser's Sentry, not the server's).
async function sendBrowserTestError(): Promise<ActionState> {
  const result = await sendTestError(Sentry, 'navegador')
  return result.ok ? ok(testErrorMessage(result)) : failed(testErrorMessage(result))
}

export function BrowserTestError() {
  return <ActionForm action={sendBrowserTestError} submitLabel="Probar desde el navegador" pendingLabel="Enviando…" variant="secondary" />
}
