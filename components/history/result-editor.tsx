'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { inputClasses } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { MAX_SETS, resultView, type BookingResult, type ResultPlayer } from '@/lib/domain/booking-result'
import { cn } from '@/lib/cn'

// A played booking's result: the line that says it, and the form that loads or corrects it, folded until it is
// wanted. The anchor is who the form asks about: the viewer, or the holder when staff loads it.
export function ResultEditor({
  bookingId,
  players,
  anchor,
  result,
  saveAction,
  clearAction,
  onDone,
}: {
  bookingId: string
  players: ResultPlayer[]
  anchor: number
  result: BookingResult | null
  saveAction: FormAction
  clearAction: FormAction
  onDone?: (message: string) => void
}) {
  const anchorPlayer = players.find((player) => player.position === anchor)
  const isMe = anchorPlayer?.isMe ?? false
  const others = players.filter((player) => player.position !== anchor)
  const currentPartner = result
    ? (result.teamA.includes(anchor) ? result.teamA : players.map((p) => p.position).filter((p) => !result.teamA.includes(p))).find(
        (position) => position !== anchor,
      )
    : (players.find((player) => player.position !== anchor && player.team !== null && player.team === anchorPlayer?.team)?.position ??
      others[0]?.position)
  const [partner, setPartner] = useState<number | undefined>(currentPartner)
  const anchorInA = result ? result.teamA.includes(anchor) : true
  const ours = (set: number) => (result ? (anchorInA ? result.gamesA[set] : result.gamesB[set]) : undefined)
  const theirs = (set: number) => (result ? (anchorInA ? result.gamesB[set] : result.gamesA[set]) : undefined)
  const view = result ? resultView(players, result) : null
  const rivals = others.filter((player) => player.position !== partner).map((player) => player.name)
  const usLabel = isMe ? 'Ustedes' : `${anchorPlayer?.name ?? 'Pareja 1'} y ${others.find((p) => p.position === partner)?.name ?? '…'}`
  const themLabel = rivals.length > 0 ? rivals.join(' y ') : 'Rivales'

  return (
    <div className="flex flex-col gap-2">
      {view ? (
        <p className="flex items-center gap-2">
          <Icon name={view.won ? 'trophy' : 'racket'} className="size-4 shrink-0" />
          <span>
            <span className="font-semibold">{view.mine ? (view.won ? 'Ganaste' : 'Perdiste') : `Ganaron ${view.winners}`}</span>{' '}
            <span className="tabular-nums">{view.mine ? view.sets : view.winnerSets}</span>
          </span>
        </p>
      ) : null}
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-accent-ink">
          {result ? 'Corregir resultado' : 'Cargar resultado'}
          <Icon name="chevron-down" className="size-4 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 pt-2">
          <ActionForm action={saveAction} submitLabel="Guardar resultado" pendingLabel="Guardando…" size="sm" variant="secondary" className="items-start" onDone={onDone}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="anchor" value={anchor} />
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold">{isMe ? '¿Con quién jugaste?' : `¿Con quién jugó ${anchorPlayer?.name ?? 'el titular'}?`}</legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {others.map((player) => (
                  <label
                    key={player.position}
                    className={cn(
                      'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
                      partner === player.position ? 'border-fg bg-fg text-bg' : 'border-border',
                    )}
                  >
                    <input
                      type="radio"
                      name="partner"
                      value={player.position}
                      checked={partner === player.position}
                      onChange={() => setPartner(player.position)}
                      className="sr-only"
                    />
                    {player.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <span />
              <span className="truncate text-sm font-semibold">{usLabel}</span>
              <span className="truncate text-sm font-semibold">{themLabel}</span>
              {Array.from({ length: MAX_SETS }, (_, set) => (
                <SetRow key={set} set={set + 1} ours={ours(set)} theirs={theirs(set)} usLabel={usLabel} themLabel={themLabel} />
              ))}
            </div>
            <p className="text-sm text-fg-muted">El tercer set solo si lo jugaron.</p>
          </ActionForm>
          {result ? (
            <ActionForm action={clearAction} submitLabel="Borrar resultado" pendingLabel="Borrando…" size="sm" variant="ghost" className="items-start" confirmLabel="¿Seguro? Tocá de nuevo" onDone={onDone}>
              <input type="hidden" name="bookingId" value={bookingId} />
            </ActionForm>
          ) : null}
        </div>
      </details>
    </div>
  )
}

function SetRow({ set, ours, theirs, usLabel, themLabel }: { set: number; ours?: number; theirs?: number; usLabel: string; themLabel: string }) {
  const games = 'w-full min-w-0 text-center tabular-nums'
  return (
    <>
      <span className="text-sm text-fg-muted">Set {set}</span>
      <input
        name={`a${set}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={30}
        defaultValue={ours}
        aria-label={`Games de ${usLabel} en el set ${set}`}
        className={cn(inputClasses, games)}
      />
      <input
        name={`b${set}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={30}
        defaultValue={theirs}
        aria-label={`Games de ${themLabel} en el set ${set}`}
        className={cn(inputClasses, games)}
      />
    </>
  )
}
