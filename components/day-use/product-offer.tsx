'use client'

import { useCallback, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { includesText, passTotal, scheduleText, spotsText, type BuyStatus, type DayUseProduct } from '@/lib/domain/day-use'
import { formatPrice } from '@/lib/domain/format'
import { rewardLabel } from '@/lib/domain/loyalty'
import type { LocalDate } from '@/lib/domain/time'

export type ProductOfferProps = {
  product: DayUseProduct
  date: LocalDate
  dateText: string
  sold: number
  status: BuyStatus
  // The player's reward, when she has one to use.
  reward: { percent: number } | null
  paymentNote: string
  action: FormAction
}

// Design: "/day-use", one pass of the chosen day. Buying asks first; the action opens the pass.
export function ProductOffer({ product, date, dateText, sold, status, reward, paymentNote, action }: ProductOfferProps) {
  const [useReward, setUseReward] = useState<boolean | null>(null)
  const close = useCallback(() => setUseReward(null), [])
  const titleId = `pase-${product.id}`
  const withReward = useReward === true && reward !== null
  const total = passTotal(product.price, withReward ? reward.percent : 0)
  const detail = withReward
    ? `Con tu recompensa (${rewardLabel(reward.percent)}): ${formatPrice(total)}. El day use con recompensa no suma sello.`
    : `${formatPrice(total)}. ${paymentNote}`

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="font-display text-xl font-bold uppercase">
            {product.name}
          </h3>
          <p className="text-sm text-fg-muted">
            {scheduleText(product)}
            {product.includes.length > 0 ? ` · ${includesText(product.includes)}` : ''}
          </p>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(product.price)}</p>
      </div>
      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-label="Cupo"
          aria-valuemin={0}
          aria-valuemax={product.capacity}
          aria-valuenow={sold}
          className="h-2 overflow-hidden rounded-full bg-bg"
        >
          <div className="h-full bg-court" style={{ width: `${Math.min(100, (sold / product.capacity) * 100)}%` }} />
        </div>
        <p className="text-sm text-fg-muted">{spotsText(product.capacity, sold)}</p>
      </div>
      {status.ok ? (
        <div className="flex flex-col gap-2">
          <Button fullWidth onClick={() => setUseReward(false)}>
            {status.text}
          </Button>
          {reward ? (
            <Button variant="secondary" fullWidth onClick={() => setUseReward(true)}>
              Usar mi recompensa ({rewardLabel(reward.percent)})
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm">{status.text}</p>
      )}
      <BottomSheet open={useReward !== null} onClose={close} title="Comprar pase">
        <p className="mb-4">
          {product.name}, {dateText}, {scheduleText(product)}. {detail} Podés cancelarlo hasta que registres el ingreso.
        </p>
        <ActionForm action={action} submitLabel="Confirmar compra" pendingLabel="Comprando…">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="useReward" value={withReward ? 'true' : 'false'} />
        </ActionForm>
      </BottomSheet>
    </article>
  )
}
