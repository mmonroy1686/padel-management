'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

export type TabItem = { href: string; label: string }

export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The player's bottom bar and the club's tabs.
export function TabNav({ label, items, variant }: { label: string; items: TabItem[]; variant: 'bottom' | 'top' }) {
  const pathname = usePathname()
  const bottom = variant === 'bottom'
  return (
    <nav
      aria-label={label}
      className={cn(
        bottom
          ? 'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]'
          : 'overflow-x-auto border-b border-border',
      )}
    >
      <ul className={cn('mx-auto flex', bottom ? 'max-w-lg justify-around' : 'max-w-5xl gap-1 px-4')}>
        {items.map((item) => {
          const current = isCurrent(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-12 items-center whitespace-nowrap px-3 text-sm font-semibold',
                  current ? 'text-accent-ink' : 'text-fg-muted hover:text-fg',
                  !bottom && current && 'border-b-2 border-accent',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
