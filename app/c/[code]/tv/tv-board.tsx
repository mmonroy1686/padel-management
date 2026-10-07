'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BracketView } from '@/components/championships/bracket-view'
import { MatchLine } from '@/components/championships/match-line'
import { cn } from '@/lib/cn'
import type { Bracket, MatchView } from '@/lib/domain/championship-views'

export type TvScreen = { key: string; title: string; matches: MatchView[] } | { key: string; title: string; bracket: Bracket }

// Design: "Modo TV": the whole screen, big letters, the club's colors; it turns every 20 seconds between "En juego
// ahora", "Próximos" and each bracket. A bar and dots tell which screen is on and when the next one comes.
export function TvBoard({ name, screens, seconds = 20 }: { name: string; screens: TvScreen[]; seconds?: number }) {
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTurn((current) => current + 1), seconds * 1000)
    return () => clearInterval(timer)
  }, [seconds])

  // Whatever a screen holds fits the monitor: when it is taller than the space left, it shrinks (never grows).
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => {
      if (!area.current || !content.current) return
      const needed = content.current.scrollHeight
      const room = area.current.clientHeight
      setScale(needed > room && needed > 0 ? room / needed : 1)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [turn, screens])

  const index = screens.length > 0 ? turn % screens.length : 0
  const screen = screens.length > 0 ? screens[index] : null
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg text-fg">
      <header className="flex items-center justify-between gap-8 border-b border-border px-10 py-6">
        <p className="font-display text-3xl font-bold uppercase text-fg-muted">{name}</p>
        {screens.length > 1 ? (
          <ol aria-label="Pantallas" className="flex items-center gap-3">
            {screens.map((item, position) => (
              <li
                key={item.key}
                aria-current={position === index ? 'step' : undefined}
                className={cn('h-3 rounded-full transition-all', position === index ? 'w-10 bg-accent' : 'w-3 bg-border')}
              >
                <span className="sr-only">{item.title}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </header>
      {screens.length > 1 ? (
        <div aria-hidden="true" className="h-1.5 bg-surface">
          <div
            key={turn}
            className="h-full origin-left bg-accent motion-safe:animate-[tv-progress_linear_forwards]"
            style={{ animationDuration: `${seconds}s` }}
          />
        </div>
      ) : null}

      <div ref={area} className="flex-1 overflow-hidden px-10 py-8">
      <div
        ref={content}
        className="flex origin-top-left flex-col gap-8"
        style={scale < 1 ? { transform: `scale(${scale})`, width: `${100 / scale}%` } : undefined}
      >
        {screen === null ? <p className="text-4xl">Todavía no hay partidos.</p> : null}
        {screen ? <h1 className="font-display text-6xl font-bold uppercase text-accent-ink">{screen.title}</h1> : null}
        {screen && 'bracket' in screen ? <BracketView bracket={screen.bracket} large showTitle={false} /> : null}
        {screen && 'matches' in screen ? (
          screen.matches.length === 0 ? (
            <p className="text-4xl text-fg-muted">Nada por ahora.</p>
          ) : (
            <ul className={cn('grid gap-8', screen.matches.length > 1 && 'grid-cols-2')}>
              {screen.matches.slice(0, 4).map((match) => (
                <li key={match.id} className="rounded-3xl border border-border bg-surface p-8">
                  <MatchLine match={match} showCategory large />
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
      </div>
    </div>
  )
}
