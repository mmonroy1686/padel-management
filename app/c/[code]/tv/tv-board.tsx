'use client'

import { useEffect, useState } from 'react'
import { BracketView } from '@/components/championships/bracket-view'
import { MatchLine } from '@/components/championships/match-line'
import type { Bracket, MatchView } from '@/lib/domain/championship-views'

export type TvScreen = { key: string; title: string; matches: MatchView[] } | { key: string; title: string; bracket: Bracket }

// Design: "Modo TV": the whole screen, big letters, the club's colors; it turns every 20 seconds between "En juego
// ahora", "Próximos" and each bracket.
export function TvBoard({ name, screens, seconds = 20 }: { name: string; screens: TvScreen[]; seconds?: number }) {
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTurn((current) => current + 1), seconds * 1000)
    return () => clearInterval(timer)
  }, [seconds])

  const screen = screens.length > 0 ? screens[turn % screens.length] : null
  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-8 overflow-hidden bg-bg p-8 text-fg lg:p-12">
      <header className="flex flex-wrap items-baseline justify-between gap-6">
        <p className="font-display text-4xl font-bold uppercase lg:text-5xl">{name}</p>
        {screen ? (
          <h1 className="font-display text-4xl font-bold uppercase text-accent-ink lg:text-5xl">{screen.title}</h1>
        ) : null}
      </header>
      {screen === null ? <p className="text-3xl">Todavía no hay partidos.</p> : null}
      {screen && 'bracket' in screen ? <BracketView bracket={screen.bracket} large /> : null}
      {screen && 'matches' in screen ? (
        <ul className="grid gap-6 lg:grid-cols-2">
          {screen.matches.length === 0 ? <li className="text-3xl">Nada por ahora.</li> : null}
          {screen.matches.map((match) => (
            <li key={match.id} className="rounded-3xl border border-border bg-surface p-6">
              <MatchLine match={match} showCategory large />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
