import { SettingsFrame } from '@/components/settings/settings-nav'
import { requireAdmin } from '@/lib/auth/viewer'
import { isPlatformAdmin } from '@/lib/data/platform'

// Ajustes, admins only: the index at /club/ajustes, each section on its own screen inside SettingsFrame (a sidebar on
// a wide screen, "‹ Ajustes" on a phone). Each page checks the role again (layouts do not re-run on every navigation).
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('/club/ajustes')
  return <SettingsFrame platformAdmin={await isPlatformAdmin()}>{children}</SettingsFrame>
}
