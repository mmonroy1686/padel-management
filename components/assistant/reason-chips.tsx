import { cn } from '@/lib/cn'
import type { Chip } from '@/lib/domain/match-suggestions'

// Why someone is a candidate: "Jugó 4 veces los martes 19:00". The strong reasons stand out.
export function ReasonChips({ name, chips }: { name: string; chips: Chip[] }) {
  if (chips.length === 0) return null
  return (
    <ul aria-label={`Por qué ${name}`} className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <li
          key={chip.text}
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs',
            chip.hit ? 'border-court-ink text-court-ink' : 'border-border text-fg-muted',
          )}
        >
          {chip.text}
        </li>
      ))}
    </ul>
  )
}
