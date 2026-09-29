import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { LocalDate } from '@/lib/domain/time'

export type DayStripProps = { days: { date: LocalDate; label: string }[]; selected: LocalDate; basePath: string }

export function DayStrip({ days, selected, basePath }: DayStripProps) {
  return (
    <nav aria-label="Día" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {days.map(({ date, label }) => {
          const current = date === selected
          return (
            <li key={date}>
              <Link
                href={`${basePath}?dia=${date}`}
                aria-current={current ? 'date' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 font-semibold',
                  current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-fg',
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
