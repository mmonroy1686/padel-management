import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { requireAdmin } from '@/lib/auth/viewer'
import { BookingRulesForm } from '../forms'

export const metadata: Metadata = { title: 'Ajustes · Reservas y partidos' }

// Ajustes → Reservas y partidos.
export default async function BookingSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/reservas')
  return (
    <>
      <SettingsHeader href="/club/ajustes/reservas" />
      <SettingsBlock id="reglas" title="Reglas" description="Los cambios no tocan las reservas ya hechas.">
        <BookingRulesForm club={club} />
      </SettingsBlock>
    </>
  )
}
