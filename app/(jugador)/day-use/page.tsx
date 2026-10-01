import type { Metadata } from 'next'
import Link from 'next/link'
import { DayStrip } from '@/components/booking/day-strip'
import { InsideList } from '@/components/day-use/inside-list'
import { ProductOffer } from '@/components/day-use/product-offer'
import { StampRow } from '@/components/day-use/stamp-row'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { Card } from '@/components/ui/card'
import { requirePlayer } from '@/lib/auth/viewer'
import { loadInside, loadLoyaltyPasses, loadMyPasses, loadOverrides, loadProducts, loadSold } from '@/lib/data/day-use'
import { buyStatus, dayUseDays, firstOpenDay, openProducts, PASS_STATUS_LABELS, soldOf, WEEK_DAYS } from '@/lib/domain/day-use'
import { dayLabel, dayLongLabel } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { loyaltyOf, loyaltyRuleOf, loyaltyRuleText, loyaltySince } from '@/lib/domain/loyalty'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { addDays, localDateOf } from '@/lib/domain/time'
import { buyDayUse } from './actions'

export const metadata: Metadata = { title: 'Day use' }

type SearchParams = Promise<{ dia?: string }>

export default async function DayUsePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePlayer('/day-use')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const last = addDays(today, WEEK_DAYS - 1)
  const { dia } = await searchParams
  const rule = loyaltyRuleOf(club)

  const [products, overrides, sold, mine, visits, inside] = await Promise.all([
    loadProducts(club),
    loadOverrides(club, today, last),
    loadSold(club, today, last),
    loadMyPasses(viewer, today),
    loadLoyaltyPasses(club, viewer.userId, loyaltySince(rule, today)),
    loadInside(club, today),
  ])
  // Without a day in the link, open on the first one that still has day use (not today's, once over).
  const selected =
    isLocalDate(dia) && dia >= today && dia <= last ? dia : firstOpenDay(today, products, overrides, now, club.timezone)
  const loyalty = loyaltyOf(visits, rule, today)
  const reward = rule.enabled && loyalty.available > 0 ? { percent: rule.discountPercent } : null
  const offers = openProducts(products, selected, overrides)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Day use</h1>
        <p className="text-fg-muted">Disfrutá el club por el día: comprá tu pase y mostralo en recepción al llegar.</p>
      </div>
      {rule.enabled ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase">Tus sellos</h2>
          <StampRow loyalty={loyalty} rule={rule} />
          <p className="text-sm text-fg-muted">{loyaltyRuleText(rule)}</p>
        </Card>
      ) : null}
      {mine.length > 0 ? (
        <section aria-labelledby="tus-pases" className="flex flex-col gap-2">
          <h2 id="tus-pases" className="font-display text-2xl font-bold uppercase">
            Tus pases
          </h2>
          <ul className="flex flex-col gap-2">
            {mine.map((pass) => (
              <li key={pass.id}>
                <Link
                  href={`/day-use/pase/${pass.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span>
                    {dayLabel(pass.date, today)}: {pass.productName}
                  </span>
                  <span className="text-sm text-fg-muted">{PASS_STATUS_LABELS[pass.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DayStrip days={dayUseDays(today, products, overrides)} selected={selected} basePath="/day-use" />
      {offers.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {offers.map((product) => {
            const count = soldOf(sold, product.id, selected)
            return (
              <li key={product.id}>
                <ProductOffer
                  product={product}
                  date={selected}
                  dateText={dayLongLabel(selected)}
                  sold={count.sold}
                  status={buyStatus(product, selected, overrides, {
                    now,
                    today,
                    timezone: club.timezone,
                    windowDays: club.booking_window_days,
                    sold: count.sold,
                    hasPass: mine.some((pass) => pass.productId === product.id && pass.date === selected),
                  })}
                  reward={reward}
                  paymentNote={paymentMethodsNote(club)}
                  action={buyDayUse}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          {products.length > 0 ? 'Ese día no hay day use. Elegí otro día.' : 'El club todavía no ofrece day use.'}
        </p>
      )}
      <InsideList people={inside} timezone={club.timezone} />
    </>
  )
}
