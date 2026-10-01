import type { Metadata } from 'next'
import Link from 'next/link'
import { DayStrip } from '@/components/booking/day-strip'
import { PassesToday } from '@/components/day-use/passes-today'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { loadOverrides, loadPassesOn, loadProducts, loadRewardsUsed } from '@/lib/data/day-use'
import { loadMemberOptions } from '@/lib/data/members'
import { dayUseDays, isOpenOn, WEEK_DAYS } from '@/lib/domain/day-use'
import { collectedToday } from '@/lib/domain/day-use-payments'
import { dayLabel, dayLongLabel, formatPrice } from '@/lib/domain/format'
import { loyaltyRuleOf } from '@/lib/domain/loyalty'
import { isLocalDate } from '@/lib/domain/input'
import { addDays, localDateOf } from '@/lib/domain/time'
import { cancelPass, checkInPass, recordPassCash, sellDayUse } from './actions'

export const metadata: Metadata = { title: 'Day use' }

type SearchParams = Promise<{ dia?: string }>

export default async function ClubDayUsePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/day-use')
  const { club, membership } = viewer
  const today = localDateOf(new Date(), club.timezone)
  const { dia } = await searchParams
  // Reception can look at the coming days too, to see who bought ahead.
  const date = isLocalDate(dia) && dia >= today && dia <= addDays(today, WEEK_DAYS - 1) ? dia : today
  const isToday = date === today
  const [passes, products, overrides, members, rewardsUsed] = await Promise.all([
    loadPassesOn(club, date),
    loadProducts(club),
    loadOverrides(club, today, addDays(today, WEEK_DAYS - 1)),
    loadMemberOptions(club.id),
    loadRewardsUsed(club, addDays(today, -30)),
  ])
  const days = dayUseDays(today, products, overrides)
  const offers = products
    .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      days: days.filter((day) => isOpenOn(product, day.date, overrides)).map(({ date, label }) => ({ date, label })),
    }))
    .filter((offer) => offer.days.length > 0)
  const rule = loyaltyRuleOf(club)
  const tiles = [
    { label: isToday ? 'Ingresos de hoy' : 'Cobrado', value: formatPrice(collectedToday(passes)) },
    { label: 'Adentro', value: String(passes.filter((pass) => pass.status === 'inside').length) },
    { label: 'Recompensas usadas (30 días)', value: String(rewardsUsed) },
  ]

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase">Day use</h2>
          <p className="text-fg-muted">{dayLongLabel(date)}</p>
        </div>
        {membership.role === 'admin' ? (
          <Link href="/club/day-use/configuracion" className={buttonClasses({ variant: 'secondary' })}>
            Configurar pases
          </Link>
        ) : null}
      </div>
      <DayStrip days={days.map(({ date: day, label, closed }) => ({ date: day, label, closed }))} selected={date} basePath="/club/day-use" />
      <dl aria-label="Resumen del día" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="flex flex-col gap-1 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{tile.label}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{tile.value}</dd>
          </Card>
        ))}
      </dl>
      <PassesToday
        passes={passes}
        today={today}
        forDay={isToday ? 'de hoy' : `del ${dayLabel(date, today)}`}
        timezone={club.timezone}
        acceptsCash={club.accepts_cash}
        actions={{ checkIn: checkInPass, cash: recordPassCash, cancel: cancelPass }}
        sell={{ offers, members, rewardPercent: rule.enabled ? rule.discountPercent : null, action: sellDayUse }}
      />
    </>
  )
}
