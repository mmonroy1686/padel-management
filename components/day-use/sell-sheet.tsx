'use client'

import { useState } from 'react'
import { HolderFields } from '@/components/club/load-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'

// A pass on sale and the coming days it runs.
export type SellOffer = { id: string; name: string; price: number; days: { date: LocalDate; label: string }[] }

// Design: "Venta en recepción": to a member (who may use her reward) or to someone without an account.
export function SellSheet({
  offers,
  members,
  rewardPercent,
  action,
  onClose,
  onDone,
}: {
  offers: SellOffer[]
  members: MemberOption[]
  // The club's reward while stamps are on; null hides the option.
  rewardPercent: number | null
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [productId, setProductId] = useState(offers[0]?.id ?? '')
  const [holder, setHolder] = useState<'guest' | 'player'>('guest')
  const offer = offers.find((item) => item.id === productId) ?? offers[0]

  return (
    <BottomSheet open onClose={onClose} title="Vender pase">
      {offer ? (
        <ActionForm action={action} submitLabel="Vender pase" pendingLabel="Vendiendo…" onDone={onDone}>
          <Field label="Pase" htmlFor="sell-product">
            <select
              id="sell-product"
              name="productId"
              value={offer.id}
              onChange={(event) => setProductId(event.target.value)}
              className={inputClasses}
            >
              {offers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}, {formatPrice(item.price)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Día" htmlFor="sell-date">
            {/* A new pass starts again from its first day. */}
            <select key={offer.id} id="sell-date" name="date" className={inputClasses}>
              {offer.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>
          <HolderFields holder={holder} onHolderChange={setHolder} members={members} />
          {holder === 'player' && rewardPercent !== null ? (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="useReward" className="size-5 accent-accent" />
              Usar su recompensa ({rewardLabel(rewardPercent)})
            </label>
          ) : null}
        </ActionForm>
      ) : (
        <p className="text-fg-muted">No hay pases a la venta en los próximos días.</p>
      )}
    </BottomSheet>
  )
}
