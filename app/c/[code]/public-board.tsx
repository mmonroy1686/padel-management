'use client'

import { SELECTED } from '@/components/ui/button'
import { useState } from 'react'
import { BracketTree } from '@/components/championships/bracket-tree'
import { MatchCard } from '@/components/championships/match-card'
import { PlayerSearch } from '@/components/championships/player-search'
import { ZonesView } from '@/components/championships/zones-view'
import { ShareButton } from '@/components/ui/share-button'
import { cn } from '@/lib/cn'
import { matchShareText, type PhaseGroup } from '@/lib/domain/championship-cards'
import type { PairCard } from '@/lib/domain/championship-search'
import type { Bracket, MatchView, ZoneView } from '@/lib/domain/championship-views'

export type PublicCategory = {
  id: string
  name: string
  rules: string
  zones: ZoneView[]
  bracket: Bracket | null
  // The matches by phase: the zones, then the knockout rounds.
  phases: PhaseGroup[]
}

// Design: "Público /c/<código>": a tab per category with what is being played, its zones, its draw and the matches
// by phase as cards, each one shareable. The TV mode is the club's: it is not linked from here.
export function PublicBoard({
  name,
  subtitle,
  categories,
  shareText,
  shareUrl,
  pairs = [],
}: {
  name: string
  subtitle: string
  categories: PublicCategory[]
  shareText: string
  // The page's address, at the end of each match's share text.
  shareUrl: string
  // "Buscar jugador": the cards of the pairs, without payments, hours or phones.
  pairs?: PairCard[]
}) {
  const [selected, setSelected] = useState(categories[0]?.id ?? '')
  const category = categories.find((item) => item.id === selected) ?? categories[0]
  const tabs = categories.length > 1
  const live = category ? category.phases.flatMap((phase) => phase.matches).filter((match) => match.status === 'playing') : []
  const card = (match: MatchView) => (
    <MatchCard match={match} share={{ title: name, text: matchShareText(match, { championshipName: name, url: shareUrl }) }} />
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold uppercase">{name}</h1>
        {subtitle ? <p className="text-fg-muted">{subtitle}</p> : null}
      </header>
      <div className="flex flex-wrap items-start gap-3">
        <ShareButton title={name} text={shareText} />
      </div>
      {pairs.length > 0 ? <PlayerSearch pairs={pairs} /> : null}
      {categories.length === 0 ? <p className="text-fg-muted">El fixture todavía no está publicado.</p> : null}
      {tabs ? (
        <div role="tablist" aria-label="Categorías" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
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
                'min-h-11 shrink-0 rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
                item.id === category?.id ? SELECTED : 'border-border',
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
          {live.length > 0 ? (
            <section aria-labelledby={`vivo-${category.id}`} className="flex flex-col gap-3">
              <h2 id={`vivo-${category.id}`} className="flex items-center gap-2 font-display text-2xl font-bold uppercase text-accent-ink">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-accent motion-safe:animate-pulse" />
                En juego ahora
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {live.map((match) => (
                  <li key={match.id}>{card(match)}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <ZonesView zones={category.zones} />
          {category.bracket ? (
            <section aria-labelledby={`cuadro-${category.id}`} className="flex flex-col gap-3">
              <h2 id={`cuadro-${category.id}`} className="font-display text-2xl font-bold uppercase">
                Cuadro
              </h2>
              <BracketTree bracket={category.bracket} />
            </section>
          ) : null}
          <section aria-labelledby={`partidos-${category.id}`} className="flex flex-col gap-5">
            <h2 id={`partidos-${category.id}`} className="font-display text-2xl font-bold uppercase">
              Partidos
            </h2>
            {category.phases.map((phase) => (
              <div key={phase.key} className="flex flex-col gap-3">
                <h3 className="border-l-4 border-accent pl-3 font-bold">{phase.title}</h3>
                <ul className="grid gap-3 md:grid-cols-2">
                  {phase.matches.map((match) => (
                    <li key={match.id}>{card(match)}</li>
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
