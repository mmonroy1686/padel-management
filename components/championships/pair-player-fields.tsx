'use client'

import { useState } from 'react'
import { Field, inputClasses } from '@/components/ui/field'
import { MemberPicker } from '@/components/ui/member-picker'
import type { MemberOption } from '@/lib/domain/members'
import { CATEGORIES } from '@/lib/domain/profile'

const KINDS = [
  { value: 'member', label: 'Es socio' },
  { value: 'guest', label: 'Es de afuera' },
] as const

// One player of a pair: a member (searched by name) or someone from outside (name and phone), and the
// category he plays. The field names start with the prefix (partnerKind, player1Name...), as
// lib/domain/championship-form.ts reads them.
export function PairPlayerFields({
  prefix,
  legend,
  members,
  defaultLevel = 5,
}: {
  prefix: string
  legend: string
  members: MemberOption[]
  defaultLevel?: number
}) {
  const [kind, setKind] = useState<'member' | 'guest'>('member')
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-4">
        {KINDS.map((option) => (
          <label key={option.value} className="inline-flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`${prefix}Kind`}
              value={option.value}
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="size-5 accent-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
      {kind === 'member' ? (
        <Field label="Nombre" htmlFor={`${prefix}-member`}>
          <MemberPicker id={`${prefix}-member`} name={`${prefix}ProfileId`} members={members} />
        </Field>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nombre y apellido" htmlFor={`${prefix}-name`}>
            <input id={`${prefix}-name`} name={`${prefix}Name`} required maxLength={60} className={inputClasses} />
          </Field>
          <Field label="Teléfono" htmlFor={`${prefix}-phone`}>
            <input
              id={`${prefix}-phone`}
              name={`${prefix}Phone`}
              type="tel"
              inputMode="tel"
              required
              maxLength={30}
              placeholder="099 123 456"
              className={inputClasses}
            />
          </Field>
        </div>
      )}
      <Field label="Categoría que juega" htmlFor={`${prefix}-level`}>
        <select id={`${prefix}-level`} name={`${prefix}Level`} defaultValue={defaultLevel} className={inputClasses}>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}ª
            </option>
          ))}
        </select>
      </Field>
    </fieldset>
  )
}
