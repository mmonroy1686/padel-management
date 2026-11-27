'use client'

import { useState } from 'react'
import { Field } from '@/components/ui/field'
import { MemberPicker } from '@/components/ui/member-picker'
import type { MemberOption } from '@/lib/domain/members'

// Signing up to a fixed-pairs americano: with a partner from the club (who gets an aviso), or alone, looking for one
// (the club pairs them before the start). The form gets pairing = partner | seeking and partnerId.
export function PairingFields({ members }: { members: MemberOption[] }) {
  const [pairing, setPairing] = useState<'partner' | 'seeking'>('partner')
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Tu pareja</legend>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="pairing"
            value="partner"
            checked={pairing === 'partner'}
            onChange={() => setPairing('partner')}
            className="size-5 accent-accent"
          />
          Con mi compañero
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="pairing"
            value="seeking"
            checked={pairing === 'seeking'}
            onChange={() => setPairing('seeking')}
            className="size-5 accent-accent"
          />
          Busco pareja
        </label>
      </div>
      {pairing === 'partner' ? (
        <>
          <Field label="Compañero" htmlFor="tournament-partner">
            <MemberPicker id="tournament-partner" name="partnerId" members={members} />
          </Field>
          <p className="text-sm text-fg-muted">Lo anotás a él también: le llega un aviso y paga su inscripción.</p>
        </>
      ) : (
        <p className="text-sm text-fg-muted">Te anotás solo y el club te junta con alguien antes de empezar.</p>
      )}
    </fieldset>
  )
}
