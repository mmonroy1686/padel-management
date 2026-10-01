'use client'

import { usePathname } from 'next/navigation'
import { isCurrent, type TabItem } from './tab-nav'

// The club panel's h1 is the section you are on (Grilla, Cobros…), so the page title and screen
// readers say where you are; "Panel del club" goes above it, smaller.
export function SectionTitle({ items, fallback }: { items: TabItem[]; fallback: string }) {
  const pathname = usePathname()
  const section = items.find((item) => isCurrent(pathname, item.href))?.label ?? fallback
  return <h1 className="font-display text-3xl font-bold uppercase">{section}</h1>
}
