'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon } from '@/components/ui/icon'
import { RowLink, RowList } from '@/components/ui/row-list'
import type { MoreItem } from '@/lib/club/tabs'
import { cn } from '@/lib/cn'
import { isCurrent, type TabItem } from './tab-nav'

// The club panel on a phone: four sections at the bottom, within the thumb's reach, and «Más» for the rest (and the
// way back to the players' app). From a tablet up the panel keeps its tabs on top (md:hidden).
export function ClubBottomNav({ bar, more }: { bar: TabItem[]; more: MoreItem[] }) {
  const pathname = usePathname()
  // Open on the path it was opened on: going to another section closes it on its own.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const inMore = more.some((item) => isCurrent(pathname, item.href))
  const itemClass = (current: boolean) =>
    cn(
      'inline-flex min-h-12 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-semibold',
      current ? 'text-accent-ink' : 'text-fg-muted',
    )
  const pill = (current: boolean, icon: TabItem['icon']) => (
    <span className={cn('inline-flex h-7 w-12 items-center justify-center rounded-full', current && 'bg-accent/20')}>
      <Icon name={icon} />
    </span>
  )

  return (
    <>
      <nav aria-label="Panel" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto flex max-w-lg justify-around">
          {bar.map((item) => {
            const current = isCurrent(pathname, item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-current={current ? 'page' : undefined} className={itemClass(current)}>
                  {pill(current, item.icon)}
                  {item.label}
                </Link>
              </li>
            )
          })}
          <li className="flex-1">
            <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpenedAt(pathname)} className={itemClass(inMore)}>
              {pill(inMore, 'more')}
              Más
            </button>
          </li>
        </ul>
      </nav>
      <BottomSheet open={open} onClose={() => setOpenedAt(null)} title="Más">
        <RowList label="Más secciones">
          {more.map((item) => (
            <RowLink key={item.href} href={item.href} icon={item.icon} title={item.label} detail={item.description} />
          ))}
        </RowList>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink underline underline-offset-4"
        >
          Ir a la app de jugadores
        </Link>
      </BottomSheet>
    </>
  )
}

