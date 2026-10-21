'use client'

import { useState, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { playerLabel, type PlayerShare, type TurnPlayers } from '@/lib/domain/club-home'
import { formatPrice } from '@/lib/domain/format'
import type { MemberOption } from '@/lib/domain/members'
import { ChargeChoice, type PayMethods } from './charge-choice'
import { PlayersSheet } from './players-sheet'

export type PlayersActions = { chargeShare: FormAction; chargeRest: FormAction; savePlayers: FormAction }

type Notice = { tone: 'ok' | 'error'; text: string }

// The players of a booking or an open match, each with "Pagó" or "Cobrar $400", "Completar jugadores" and
// "Cobrar todo lo que falta". The same block on the Inicio and in the Grilla. The outcome of a charge shows here
// (it outlives the row that changed); with onDone the caller takes successes instead (the Grilla closes its sheet).
export function BookingPlayers({
  bookingId,
  turn,
  methods,
  members,
  actions,
  onDone,
  playerExtra,
}: {
  bookingId: string
  turn: TurnPlayers
  methods: PayMethods
  members: MemberOption[]
  actions: PlayersActions
  onDone?: (message: string) => void
  playerExtra?: (player: PlayerShare) => ReactNode
}) {
  const [charging, setCharging] = useState<number | 'rest' | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const canCharge = methods.cash || methods.transfer

  const succeed = (text: string) => {
    setCharging(null)
    setEditing(false)
    if (onDone) onDone(text)
    else setNotice({ tone: 'ok', text })
  }
  const fail = (text: string) => {
    setCharging(null)
    setNotice({ tone: 'error', text })
  }
  const startCharge = (target: number | 'rest') => {
    setNotice(null)
    setCharging(target)
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Jugadores" className="flex flex-col gap-2">
        {turn.players.map((player) => {
          const label = playerLabel(player)
          const title = `Cobrar ${formatPrice(player.due)} a ${label}`
          return (
            <li key={player.position} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('font-semibold', player.name === null && 'text-fg-muted')}>{label}</span>
                {player.state === 'paid' ? (
                  <span className="text-sm font-semibold text-court-ink">Pagó</span>
                ) : player.state === 'reported' ? (
                  <span className="text-sm text-accent-ink">Transferencia informada</span>
                ) : canCharge && charging !== player.position ? (
                  <Button variant="secondary" aria-label={title} onClick={() => startCharge(player.position)}>
                    Cobrar {formatPrice(player.due)}
                  </Button>
                ) : null}
              </div>
              {charging === player.position ? (
                <ChargeChoice
                  title={title}
                  fields={{ bookingId, position: String(player.position) }}
                  action={actions.chargeShare}
                  methods={methods}
                  onDone={succeed}
                  onError={fail}
                  onCancel={() => setCharging(null)}
                />
              ) : null}
              {playerExtra?.(player)}
            </li>
          )
        })}
      </ul>
      {turn.isMatch ? null : (
        <Button
          variant="ghost"
          onClick={() => {
            setNotice(null)
            setEditing(true)
          }}
        >
          {turn.missingNames ? 'Completar jugadores' : 'Cambiar jugadores'}
        </Button>
      )}
      {canCharge && turn.restDue > 0 ? (
        charging === 'rest' ? (
          <ChargeChoice
            title={`Cobrar todo lo que falta (${formatPrice(turn.restDue)})`}
            fields={{ bookingId }}
            action={actions.chargeRest}
            methods={methods}
            onDone={succeed}
            onError={fail}
            onCancel={() => setCharging(null)}
          />
        ) : (
          <Button variant="primary" onClick={() => startCharge('rest')}>
            Cobrar todo lo que falta ({formatPrice(turn.restDue)})
          </Button>
        )
      ) : null}
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn('rounded-xl border bg-bg p-3 text-sm', notice.tone === 'error' ? 'border-accent' : 'border-border')}
        >
          {notice.text}
        </p>
      ) : null}
      {editing ? (
        <PlayersSheet
          bookingId={bookingId}
          players={turn.players}
          members={members}
          action={actions.savePlayers}
          onClose={() => setEditing(false)}
          onDone={succeed}
        />
      ) : null}
    </div>
  )
}
