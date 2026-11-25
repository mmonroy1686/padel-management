'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useReportActivity } from '@/components/ui/activity'
import { Icon, type IconName } from '@/components/ui/icon'
import { useEdgeFade } from '@/components/ui/use-edge-fade'
import { cn } from '@/lib/cn'

// `also`: other paths that belong to this tab (e.g. /campeonatos under Torneos).
export type TabItem = { href: string; label: string; icon: IconName; also?: string[] }

export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The player's bottom bar and the club's tabs.
export function TabNav({ label, items, variant }: { label: string; items: TabItem[]; variant: 'bottom' | 'top' }) {
  const pathname = usePathname()
  const bottom = variant === 'bottom'
  // The club's tabs scroll sideways on a phone: fade the edge that has more, and keep the current one in view.
  const fade = useEdgeFade<HTMLElement>(pathname, !bottom)

  return (
    <nav
      {...fade}
      aria-label={label}
      className={cn(
        bottom
          ? 'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]'
          : 'tab-scroll overflow-x-auto border-b border-border',
      )}
    >
      <ul className={cn('mx-auto flex', bottom ? 'max-w-lg justify-around md:max-w-3xl lg:max-w-5xl' : 'max-w-6xl gap-1 px-4 2xl:max-w-7xl')}>
        {items.map((item) => {
          const current = isCurrent(pathname, item.href) || (item.also ?? []).some((href) => isCurrent(pathname, href))
          return (
            <li key={item.href} className={cn(bottom && 'flex-1')}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-12 items-center whitespace-nowrap font-semibold',
                  bottom ? 'w-full flex-col justify-center gap-0.5 px-1 py-1.5 text-xs' : 'gap-2 px-3 text-sm',
                  current ? 'text-accent-ink' : 'text-fg-muted hover:text-fg',
                  !bottom && current && 'border-b-2 border-accent',
                )}
              >
                {bottom ? (
                  // The current tab gets a pill behind its icon, not only a color: it reads in the sun and for everyone.
                  <span className={cn('inline-flex h-7 w-12 items-center justify-center rounded-full', current && 'bg-accent/20')}>
                    <Icon name={item.icon} />
                  </span>
                ) : (
                  <Icon name={item.icon} />
                )}
                {item.label}
                <NavigationActivity />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Pages here are dynamic, so a tap can wait on the server: show the top bar meanwhile.
function NavigationActivity() {
  const { pending } = useLinkStatus()
  useReportActivity(pending)
  return null
}
