'use client'

import { useCallback, useId, useState } from 'react'
import { PairCardView, type CashOption } from '@/components/championships/pair-card-view'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { searchPairs, type PairCard } from '@/lib/domain/championship-search'

// Design: "Buscar jugador": the pairs show while typing (every word, no accents), each with its category; a pair
// opens its card. cash: the club's "Cobrar" (the public page has none).
export function PlayerSearch({ pairs, cash }: { pairs: PairCard[]; cash?: CashOption }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const close = useCallback(() => setOpenId(null), [])
  const hits = searchPairs(pairs, query)
  const card = pairs.find((item) => item.entryId === openId) ?? null

  return (
    <div role="search" className="flex flex-col gap-2">
      <Field label="Buscar jugador" htmlFor={`${id}-query`}>
        <input
          id={`${id}-query`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o apellido"
          autoComplete="off"
          className={inputClasses}
        />
      </Field>
      {query.trim() === '' ? null : hits.length === 0 ? (
        <p className="text-sm text-fg-muted">No encontramos a nadie con ese nombre.</p>
      ) : (
        <ul aria-label="Resultados" className="flex flex-col gap-1">
          {hits.map((hit) => (
            <li key={hit.entryId}>
              <button
                type="button"
                onClick={() => setOpenId(hit.entryId)}
                className="flex min-h-11 w-full items-center rounded-xl border border-border bg-surface px-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={card !== null} onClose={close} title={card?.pair ?? ''}>
        {card ? <PairCardView card={card} cash={cash} /> : null}
      </BottomSheet>
    </div>
  )
}
