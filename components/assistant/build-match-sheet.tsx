'use client'

import { useActionState, useMemo, useState } from 'react'
import { InviteList } from '@/components/assistant/invite-list'
import type { PlayerContact } from '@/lib/domain/contact'
import { ReasonChips } from '@/components/assistant/reason-chips'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { IDLE, type CreateMatchAction, type CreatedState, type InviteAction } from '@/lib/actions/result'
import type { BoardSlot } from '@/lib/domain/assistant-board'
import { matchLine } from '@/lib/domain/match-invite-notifications'
import { MATCH_TYPE_LABELS, MATCH_TYPES } from '@/lib/domain/matches'
import { candidatesFor, DEFAULT_CHOICE, fits, isStrong, sideWarning, type Choice } from '@/lib/domain/slot-planner'

const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8]

// "Armar partido" on a free slot: the proposal preloaded, who fits the choice and why, then "Crear partido". Once
// created, the same sheet invites.
export function BuildMatchSheet({
  slot,
  timezone,
  siteUrl,
  createAction,
  inviteAction,
  whatsapp = {},
  onClose,
}: {
  slot: BoardSlot
  timezone: string
  siteUrl: string
  createAction: CreateMatchAction
  inviteAction: InviteAction
  whatsapp?: Record<string, PlayerContact>
  onClose: () => void
}) {
  const { proposal } = slot
  const [choice, setChoice] = useState<Choice>(
    proposal ? { categoryMin: proposal.categoryMin, categoryMax: proposal.categoryMax, type: proposal.type } : DEFAULT_CHOICE,
  )
  const [state, formAction, pending] = useActionState<CreatedState, FormData>(createAction, IDLE)
  const candidates = useMemo(
    () => candidatesFor(slot.rows, choice, { startsAt: slot.startsAt, courtName: slot.courtName, timezone }),
    [slot, choice, timezone],
  )
  const warning = sideWarning(slot.rows.filter((row) => fits(row, choice) && isStrong(row)))
  const matchId = state.status === 'ok' ? (state.matchId ?? null) : null

  return (
    <BottomSheet open onClose={onClose} title={`Armar partido · ${slot.courtName} · ${slot.label}`}>
      {matchId ? (
        <div className="flex flex-col gap-4">
          <p role="status">{state.message}</p>
          <InviteList
            matchId={matchId}
            candidates={candidates}
            whatsapp={whatsapp}
            timezone={timezone}
            message={`🎾 ${matchLine({ courtName: slot.courtName, startsAt: slot.startsAt, ...choice }, timezone)}\nSumate acá: ${siteUrl}/partidos/${matchId}`}
            inviteAction={inviteAction}
          />
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="courtId" value={slot.courtId} />
          <input type="hidden" name="startsAt" value={slot.startsAt.toISOString()} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" htmlFor="build-min">
              <select
                id="build-min"
                name="categoryMin"
                value={choice.categoryMin}
                onChange={(event) => setChoice({ ...choice, categoryMin: Number(event.target.value) })}
                className={inputClasses}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}ª
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hasta" htmlFor="build-max">
              <select
                id="build-max"
                name="categoryMax"
                value={choice.categoryMax}
                onChange={(event) => setChoice({ ...choice, categoryMax: Number(event.target.value) })}
                className={inputClasses}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}ª
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Tipo" htmlFor="build-type">
            <select
              id="build-type"
              name="matchType"
              value={choice.type}
              onChange={(event) => {
                const type = MATCH_TYPES.find((value) => value === event.target.value)
                if (type) setChoice({ ...choice, type })
              }}
              className={inputClasses}
            >
              {MATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MATCH_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="allowOtherCourt" defaultChecked className="size-5 accent-accent" />
            Puede ir a otra cancha
          </label>

          <section aria-labelledby="build-candidates" className="flex flex-col gap-2">
            <h3 id="build-candidates" className="font-semibold">
              {candidates.length === 0 ? 'Nadie suele jugar a esta hora con esa categoría' : `Pueden jugar: ${candidates.length}`}
            </h3>
            {warning ? <p className="text-sm font-semibold text-court-ink">{warning}</p> : null}
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                <li key={candidate.playerId} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                  <p className="font-semibold">{candidate.name}</p>
                  <ReasonChips name={candidate.name} chips={candidate.chips} />
                </li>
              ))}
            </ul>
          </section>

          {state.status === 'error' ? <p role="alert">{state.message}</p> : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? 'Creando…' : 'Crear partido'}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}
