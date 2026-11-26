import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-surface p-4', className)} {...props} />
}

// A card that opens somewhere as a whole: its quiet «Ver …» link stretches over the card (the card needs `relative`);
// a button inside it goes above with `relative z-10`.
export const CARD_LINK =
  "inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-accent-ink after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
