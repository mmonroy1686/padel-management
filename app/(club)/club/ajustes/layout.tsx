import { SettingsNav } from '@/components/settings/settings-nav'
import { requireAdmin } from '@/lib/auth/viewer'

// Ajustes, admins only: the section menu at the side (on top on a phone) and the section's screen next to it. Each page
// checks the role again (layouts do not re-run on every navigation).
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('/club/ajustes')
  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <SettingsNav />
      <div className="flex min-w-0 max-w-3xl flex-col gap-8">{children}</div>
    </div>
  )
}
