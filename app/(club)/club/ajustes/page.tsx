import type { Metadata } from 'next'
import { RowLink, RowList } from '@/components/ui/row-list'
import { requireAdmin } from '@/lib/auth/viewer'
import { visibleSections } from '@/lib/club/settings-sections'
import { isPlatformAdmin } from '@/lib/data/platform'

export const metadata: Metadata = { title: 'Ajustes · Club' }

// Ajustes' index: every section as a row with what goes in it, so an admin reads where a setting lives instead of
// guessing from a grid of tiles. Each section opens on its own screen.
export default async function SettingsIndexPage() {
  await requireAdmin('/club/ajustes')
  const sections = visibleSections(await isPlatformAdmin())
  return (
    <nav aria-label="Secciones de ajustes">
      <RowList>
        {sections.map((section) => (
          <RowLink key={section.href} href={section.href} icon={section.icon} title={section.label} detail={section.description} />
        ))}
      </RowList>
    </nav>
  )
}
