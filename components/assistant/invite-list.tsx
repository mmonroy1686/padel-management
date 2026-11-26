'use client'

import { BrandIcon } from '@/components/ui/brand-icon'
import { useState, useTransition } from 'react'
import { ReasonChips } from '@/components/assistant/reason-chips'
import { Button, buttonClasses } from '@/components/ui/button'
import type { InviteAction } from '@/lib/actions/result'
import { whatsappUrl } from '@/lib/domain/match-share'
import { inviteText } from '@/lib/domain/match-suggestions'
import type { CandidateView } from '@/lib/domain/slot-planner'

const BEST = 8

// The match is out: invite each candidate (an aviso in the app and a mail), or send her the message by WhatsApp.
// Whoever was invited is marked and cannot be invited again to this match.
// What the desk sees after inviting: the avisos that went out, and the ones that were already invited.
export function inviteResultText(invited: number, asked: number): string {
  const sent = invited === 0 ? 'No mandamos avisos nuevos.' : invited === 1 ? 'Le avisamos a 1 en la app y por mail.' : `Les avisamos a ${invited} en la app y por mail.`
  const before = asked - invited
  if (before <= 0) return sent
  return `${sent} ${before === 1 ? '1 ya estaba invitado' : `${before} ya estaban invitados`}.`
}

export function InviteList({
  matchId,
  candidates,
  message,
  inviteAction,
}: {
  matchId: string
  candidates: CandidateView[]
  message: string
  inviteAction: InviteAction
}) {
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set())
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const best = candidates.filter((candidate) => !invited.has(candidate.playerId)).slice(0, BEST)

  function invite(ids: string[]) {
    startTransition(async () => {
      const answer = await inviteAction(matchId, ids)
      if (!answer.ok) {
        setResult({ ok: false, text: answer.message })
        return
      }
      // Everyone asked for is invited now: the ones the database skipped already were (another tab, another person).
      setInvited((previous) => new Set([...previous, ...ids]))
      setResult({ ok: true, text: inviteResultText(answer.invited, ids.length) })
    })
  }

  return (
    <section aria-labelledby="invitar" className="flex flex-col gap-3">
      <h3 id="invitar" className="font-display text-xl font-bold uppercase">
        Invitá a los que suelen jugar
      </h3>
      {candidates.length === 0 ? (
        <p className="text-fg-muted">Nadie suele jugar a esta hora con esa categoría. Compartí el partido en el grupo del club.</p>
      ) : null}
      {best.length >= 2 ? (
        <Button onClick={() => invite(best.map((candidate) => candidate.playerId))} disabled={pending}>
          {`Invitar a los mejores ${best.length}`}
        </Button>
      ) : null}
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="font-semibold">{candidate.name}</p>
            <ReasonChips name={candidate.name} chips={candidate.chips} />
            <div className="flex flex-wrap gap-2">
              {invited.has(candidate.playerId) ? (
                <p className="inline-flex min-h-11 items-center font-semibold text-court-ink">Invitado ✓</p>
              ) : (
                <Button size="sm" onClick={() => invite([candidate.playerId])} disabled={pending} aria-label={`Invitar a ${candidate.name}`}>
                  Invitar
                </Button>
              )}
              <a
                href={whatsappUrl(inviteText(candidate.name, message))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp a ${candidate.name}`}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <BrandIcon name="whatsapp" className="size-4" />
                WhatsApp
              </a>
            </div>
          </li>
        ))}
      </ul>
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className="text-sm">
          {result.text}
        </p>
      ) : null}
    </section>
  )
}
