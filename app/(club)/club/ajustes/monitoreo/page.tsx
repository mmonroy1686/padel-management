import type { Metadata } from 'next'
import { BrowserTestError } from '@/components/settings/browser-test-error'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/viewer'
import { isPlatformAdmin } from '@/lib/data/platform'
import { sendServerTestError } from '../actions'

export const metadata: Metadata = { title: 'Ajustes · Monitoreo' }

// Ajustes → Monitoreo: check that Sentry gets the app's errors, from the server and from the browser. A tool for the
// platform admin (the developer); a club admin never sees it.
export default async function MonitoringSettingsPage() {
  await requireAdmin('/club/ajustes/monitoreo')
  if (!(await isPlatformAdmin())) notFound()
  return (
    <>
      <SettingsHeader href="/club/ajustes/monitoreo" />
      <SettingsBlock
        id="prueba"
        title="Probar el monitoreo de errores"
        description="Manda un error de prueba a Sentry, que avisa cuando algo falla en la app. Aparece en Sentry → Issues como «Prueba de monitoreo» y después se puede marcar como resuelto. Nadie más lo ve."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionForm action={sendServerTestError} submitLabel="Probar desde el servidor" pendingLabel="Enviando…" variant="secondary" />
          <BrowserTestError />
        </div>
      </SettingsBlock>
    </>
  )
}
