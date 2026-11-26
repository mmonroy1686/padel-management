'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { currentSection, SETTINGS_SECTIONS } from '@/lib/club/settings-sections'

// Ajustes around a section: on a wide screen a sidebar with every section that stays in view; on a phone one link back
// to the index ("‹ Ajustes") instead of nine tiles above every form. The index itself (/club/ajustes) is already the
// menu, so it goes without either.
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const current = currentSection(pathname)
  if (!current) return <div className="flex min-w-0 max-w-3xl flex-col gap-8">{children}</div>
  return (
    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <Link href="/club/ajustes" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-accent-ink md:hidden">
        <Icon name="chevron-right" className="size-4 rotate-180" />
        Ajustes
      </Link>
      <SettingsNav currentHref={current.href} />
      <div className="flex min-w-0 max-w-3xl flex-col gap-8">{children}</div>
    </div>
  )
}

// The sidebar (wide screens): the current section has aria-current and a filled style.
export function SettingsNav({ currentHref }: { currentHref: string }) {
  return (
    <nav aria-label="Secciones de ajustes" className="hidden md:sticky md:top-4 md:block md:self-start">
      <ul className="flex flex-col gap-1">
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.href === currentHref
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-xl px-4 font-semibold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  active ? 'bg-accent text-on-accent' : 'text-fg hover:bg-surface',
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
