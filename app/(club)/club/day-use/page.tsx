import type { Metadata } from 'next'
import Link from 'next/link'
import { deskMethods } from '@/lib/domain/payments'
import { DayStrip } from '@/components/booking/day-strip'
import { PassesToday } from '@/components/day-use/passes-today'
import { LiveOccupancy } from '@/components/live/live-occupancy'
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
  // The day in one line, and only what moved: three tiles of $0 / 0 / 0 above the action said nothing.
  const summary = [
    collectedToday(passes) > 0 ? `${formatPrice(collectedToday(passes))} ${isToday ? 'cobrados hoy' : 'cobrados'}` : null,
    passes.some((pass) => pass.status === 'inside') ? `${passes.filter((pass) => pass.status === 'inside').length} adentro` : null,
    rewardsUsed > 0 ? `${rewardsUsed} recompensas usadas en 30 días` : null,
  ].filter((part): part is string => part !== null)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <p className="text-lg font-semibold">{dayLongLabel(date)}</p>
      <DayStrip days={days.map(({ date: day, label, closed }) => ({ date: day, label, closed }))} selected={date} basePath="/club/day-use" />
      {summary.length > 0 ? (
        <p aria-label="Resumen del día" className="text-fg-muted">
          {summary.join(' · ')}
        </p>
      ) : null}
      <PassesToday
        passes={passes}
        today={today}
        forDay={isToday ? 'de hoy' : `del ${dayLabel(date, today)}`}
        timezone={club.timezone}
        deskMethods={deskMethods(club)}
        actions={{ checkIn: checkInPass, cash: recordPassCash, cancel: cancelPass }}
        sell={{ offers, members, rewardPercent: rule.enabled ? rule.discountPercent : null, action: sellDayUse }}
      />
      {membership.role === 'admin' ? (
        <Link href="/club/day-use/configuracion" className="inline-flex min-h-11 items-center self-start font-semibold text-accent-ink underline underline-offset-4">
          Configurar pases y horarios
        </Link>
      ) : null}
    </>
  )
}
