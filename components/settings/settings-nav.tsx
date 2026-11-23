'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { currentSection, SETTINGS_SECTIONS } from '@/lib/club/settings-sections'

// Ajustes' own menu: a sidebar that stays in view on a wide screen, the same links as buttons that wrap above the
// content on a phone, two per row (no sideways scroll). The current section has aria-current and a filled style.
export function SettingsNav() {
  const pathname = usePathname()
  const current = currentSection(pathname)
  return (
    <nav aria-label="Secciones de ajustes" className="md:sticky md:top-4 md:self-start">
      <ul className="grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-1">
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.href === current?.href
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  'w-full max-md:border max-md:border-border md:px-4 md:text-base',
                  active ? 'bg-accent text-on-accent max-md:border-accent' : 'text-fg hover:bg-surface',
                )}
              >
                <Icon name={section.icon} className={active ? 'text-on-accent' : 'text-accent-ink'} />
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
