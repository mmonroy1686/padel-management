'use client'

import Link from 'next/link'
import { useEdgeFade } from '@/components/ui/use-edge-fade'
import { cn } from '@/lib/cn'
import type { LocalDate } from '@/lib/domain/time'

export type DayStripProps = {
  // closed: no day use that day (the day use screen); the booking screen never sets it.
  days: { date: LocalDate; label: string; closed?: boolean }[]
  selected: LocalDate
  basePath: string
}

// The days scroll sideways on a phone: the edge with more days fades, the chosen one stays in view, and a swipe
// stops on a day instead of halfway.
export function DayStrip({ days, selected, basePath }: DayStripProps) {
  const fade = useEdgeFade<HTMLElement>(selected)
  return (
    <nav {...fade} aria-label="Día" className="tab-scroll -mx-4 snap-x snap-proximity scroll-px-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {days.map(({ date, label, closed }) => {
          const current = date === selected
          return (
            <li key={date} className="snap-start">
              <Link
                href={`${basePath}?dia=${date}`}
                aria-current={current ? 'date' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-semibold',
                  current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg',
                  closed && 'line-through',
                )}
              >
                {label}
                {closed ? <span className="sr-only">, sin day use</span> : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
