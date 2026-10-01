'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import type { FormAction } from '@/components/ui/action-form'
import { searchPasses, type DayUsePass } from '@/lib/domain/day-use'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'
import { PassStaffCard, type PassActions } from './pass-staff-card'
import { SellSheet, type SellOffer } from './sell-sheet'

// Design: "Hoy". The passes of a day (today unless reception picks another) with a search by name
// or code, and the sale at the desk.
export function PassesToday({
  passes,
  today,
  forDay = 'de hoy',
  timezone,
  acceptsCash,
  actions,
  sell,
}: {
  passes: DayUsePass[]
  today: LocalDate
  // "de hoy", "del viernes 2": what the title and the empty list say.
  forDay?: string
  timezone: string
  acceptsCash: boolean
  actions: PassActions
  sell: { offers: SellOffer[]; members: MemberOption[]; rewardPercent: number | null; action: FormAction }
}) {
  const [query, setQuery] = useState('')
  const [selling, setSelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const done = useCallback((message: string) => {
    setSelling(false)
    setNotice(message)
  }, [])
  const shown = searchPasses(passes, query)

  return (
    <section aria-labelledby="pases-hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pases-hoy" className="font-display text-2xl font-bold uppercase">
          Pases {forDay} ({passes.length})
        </h2>
        <Button onClick={() => setSelling(true)}>Vender pase</Button>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <Field label="Buscar por nombre o código" htmlFor="pass-search">
        <input
          id="pass-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: Rodríguez o DU-482193"
          className={inputClasses}
        />
      </Field>
      {shown.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((pass) => (
            <li key={pass.id}>
              <PassStaffCard pass={pass} today={today} timezone={timezone} acceptsCash={acceptsCash} actions={actions} onDone={done} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
          {passes.length > 0 ? 'Nadie coincide con esa búsqueda.' : `Todavía no hay pases ${forDay === 'de hoy' ? 'para hoy' : forDay}.`}
        </p>
      )}
      {selling ? (
        <SellSheet
          offers={sell.offers}
          members={sell.members}
          rewardPercent={sell.rewardPercent}
          action={sell.action}
          onClose={() => setSelling(false)}
          onDone={done}
        />
      ) : null}
    </section>
  )
}
