import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { LocalDate } from '@/lib/domain/time'

export type DayStripProps = {
  // closed: no day use that day (the day use screen); the booking screen never sets it.
  days: { date: LocalDate; label: string; closed?: boolean }[]
  selected: LocalDate
  basePath: string
}

export function DayStrip({ days, selected, basePath }: DayStripProps) {
  return (
    <nav aria-label="Día" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {days.map(({ date, label, closed }) => {
          const current = date === selected
          return (
            <li key={date}>
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
