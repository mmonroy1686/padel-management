'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BracketView } from '@/components/championships/bracket-view'
import { MatchLine } from '@/components/championships/match-line'
import { ZonesView } from '@/components/championships/zones-view'
import { buttonClasses } from '@/components/ui/button'
import { ShareButton } from '@/components/ui/share-button'
import { cn } from '@/lib/cn'
import type { Bracket, DayGroup, ZoneView } from '@/lib/domain/championship-views'

export type PublicCategory = {
  id: string
  name: string
  rules: string
  zones: ZoneView[]
  bracket: Bracket | null
  days: DayGroup[]
}

// Design: "Público /c/<código>": a tab per category with its groups and tables, its bracket and the matches by
// day with their results; "Compartir" and the TV mode.
export function PublicBoard({
  name,
  subtitle,
  categories,
  shareText,
  tvHref,
}: {
  name: string
  subtitle: string
  categories: PublicCategory[]
  shareText: string
  tvHref: string
}) {
  const [selected, setSelected] = useState(categories[0]?.id ?? '')
  const category = categories.find((item) => item.id === selected) ?? categories[0]
  const tabs = categories.length > 1

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold uppercase">{name}</h1>
        {subtitle ? <p className="text-fg-muted">{subtitle}</p> : null}
      </header>
      <div className="flex flex-wrap items-start gap-3">
        <ShareButton title={name} text={shareText} />
        <Link href={tvHref} className={buttonClasses({ variant: 'secondary' })}>
          Modo TV
        </Link>
      </div>
      {categories.length === 0 ? <p className="text-fg-muted">El fixture todavía no está publicado.</p> : null}
      {tabs ? (
        <div role="tablist" aria-label="Categorías" className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={item.id === category?.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setSelected(item.id)}
              className={cn(
                'min-h-11 rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
                item.id === category?.id ? 'border-accent bg-accent text-on-accent' : 'border-border',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {category ? (
        <div
          role="tabpanel"
          id={`panel-${category.id}`}
          aria-labelledby={tabs ? `tab-${category.id}` : undefined}
          aria-label={tabs ? undefined : category.name}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-fg-muted">{category.rules}</p>
          <ZonesView zones={category.zones} />
          {category.bracket ? <BracketView bracket={category.bracket} /> : null}
          <section aria-labelledby={`partidos-${category.id}`} className="flex flex-col gap-3">
            <h2 id={`partidos-${category.id}`} className="font-display text-2xl font-bold uppercase">
              Partidos
            </h2>
            {category.days.map((day) => (
              <div key={day.key} className="flex flex-col gap-2">
                <h3 className="font-semibold">{day.label}</h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {day.matches.map((match) => (
                    <li key={match.id} className="rounded-2xl border border-border bg-surface p-3">
                      <MatchLine match={match} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  )
}
