import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { requireAdmin } from '@/lib/auth/viewer'
import { PaymentsForm } from '../forms'

export const metadata: Metadata = { title: 'Ajustes · Pagos' }

// Ajustes → Pagos.
export default async function PaymentSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/pagos')
  return (
    <>
      <SettingsHeader href="/club/ajustes/pagos" />
      <SettingsBlock id="medios" title="Medios de pago" description="Los jugadores eligen entre los que tengas activos al reservar.">
        <PaymentsForm club={club} />
      </SettingsBlock>
    </>
  )
}
