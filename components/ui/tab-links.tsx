import Link from 'next/link'
import { cn } from '@/lib/cn'

export type TabLink = { key: string; label: string; href: string }

// Tabs that are links (?ver=…): each one has its own address, the back button works and the server renders only the
// one shown. On a phone the bar slides sideways.
export function TabLinks({ label, items, current }: { label: string; items: TabLink[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <ul className="flex gap-2 md:flex-wrap">
        {items.map((item) => (
          <li key={item.key} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.key === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
                item.key === current ? 'border-accent bg-accent text-on-accent' : 'border-border hover:border-accent',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
