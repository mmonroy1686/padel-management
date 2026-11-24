import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadCourtsAndPrices } from '@/lib/data/club-setup'
import { CourtsEditor, PricesEditor } from '../forms'

export const metadata: Metadata = { title: 'Ajustes · Canchas y precios' }

// Ajustes → Canchas y precios: what can be booked and what each slot costs.
export default async function CourtsSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/canchas')
  const { courts, rules } = await loadCourtsAndPrices(club.id)

  return (
    <>
      <SettingsHeader href="/club/ajustes/canchas" />
      <SettingsBlock id="canchas" title="Canchas" card={false}>
        <CourtsEditor courts={courts} />
      </SettingsBlock>
      <SettingsBlock
        id="precios"
        title="Precios por franja"
        description="El precio de un turno sale de la franja que cubre su hora de inicio. Un turno sin franja no se ofrece."
        card={false}
      >
        <PricesEditor rules={rules} />
      </SettingsBlock>
    </>
  )
}
