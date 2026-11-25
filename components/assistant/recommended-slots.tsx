'use client'

import { Button } from '@/components/ui/button'
import type { BoardSlot } from '@/lib/domain/assistant-board'

// Up to three slots where a match is likely to fill, with "Armar". Nothing when no slot has demand.
export function RecommendedSlots({ items, onPick }: { items: { slot: BoardSlot; text: string }[]; onPick: (slot: BoardSlot) => void }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="recomendados" className="flex flex-col gap-3">
      <h2 id="recomendados" className="text-lg font-semibold">
        Recomendados para armar
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map(({ slot, text }) => (
          <li key={slot.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <p className="font-semibold">{text}</p>
            <Button size="sm" onClick={() => onPick(slot)} aria-label={`Armar ${text}`}>
              Armar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
