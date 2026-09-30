import type { PassStatus } from './day-use'
import { readBoolean, readInt } from './input'
import type { ParseResult } from './settings'
import { parseLocalDate, type LocalDate } from './time'

export type LoyaltyRule = { enabled: boolean; every: number; discountPercent: number; expiryMonths: number | null }
// boughtOn: the club's date the pass was bought, which is when a reward is used.
export type LoyaltyPass = { date: LocalDate; boughtOn: LocalDate; status: PassStatus; usedReward: boolean }
export type Loyalty = { stamps: number; earned: number; used: number; available: number; progress: number }

export const NO_LOYALTY: Loyalty = { stamps: 0, earned: 0, used: 0, available: 0, progress: 0 }
export const LOYALTY_EXPIRY_OPTIONS = [3, 6, 12, 24] as const

type ClubLoyalty = {
  loyalty_enabled: boolean
  loyalty_every: number
  loyalty_discount_percent: number
  loyalty_expiry_months: number | null
}

export function loyaltyRuleOf(club: ClubLoyalty): LoyaltyRule {
  return {
    enabled: club.loyalty_enabled,
    every: club.loyalty_every,
    discountPercent: club.loyalty_discount_percent,
    expiryMonths: club.loyalty_expiry_months,
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

// Like Postgres date - interval 'n months': the same day n months back, or that month's last day.
export function monthsBefore(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const index = year * 12 + (month - 1) - months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index - targetYear * 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
}

// The first date whose passes count; null when stamps never expire.
export function loyaltySince(rule: LoyaltyRule, today: LocalDate): LocalDate | null {
  return rule.expiryMonths === null ? null : monthsBefore(today, rule.expiryMonths)
}

// Same as private.loyalty_of: check-ins without a reward are stamps; passes bought with a reward (not
// cancelled) use one, on the day they were bought. Going through both in date order, a stamp drops
// once it is older than the expiry on that day, and each use takes the `every` oldest stamps left.
// What remains today makes the progress and the rewards available.
export function loyaltyOf(passes: LoyaltyPass[], rule: LoyaltyRule, today: LocalDate): Loyalty {
  if (!rule.enabled) return NO_LOYALTY
  const events = [
    ...passes.filter((pass) => pass.status === 'inside' && !pass.usedReward).map((pass) => ({ day: pass.date, use: false })),
    ...passes.filter((pass) => pass.status !== 'cancelled' && pass.usedReward).map((pass) => ({ day: pass.boughtOn, use: true })),
  ].sort((a, b) => (a.day === b.day ? Number(a.use) - Number(b.use) : a.day < b.day ? -1 : 1))

  const unexpired = (stamps: LocalDate[], day: LocalDate) => {
    const since = loyaltySince(rule, day)
    return since === null ? stamps : stamps.filter((stamp) => stamp >= since)
  }
  const sinceToday = loyaltySince(rule, today)
  let stamps: LocalDate[] = []
  let used = 0
  for (const event of events) {
    stamps = unexpired(stamps, event.day)
    if (!event.use) {
      stamps.push(event.day)
    } else {
      stamps = stamps.slice(rule.every)
      if (sinceToday === null || event.day >= sinceToday) used += 1
    }
  }
  const left = unexpired(stamps, today).length
  const available = Math.floor(left / rule.every)
  return { stamps: left, earned: available + used, used, available, progress: left % rule.every }
}

export function rewardLabel(percent: number): string {
  return `-${percent}%`
}

export function stampsText(loyalty: Loyalty, rule: LoyaltyRule): string {
  return `${loyalty.progress} de ${rule.every} sellos`
}

export function loyaltyRuleText(rule: LoyaltyRule): string {
  if (!rule.enabled) return ''
  const reward = rule.discountPercent === 100 ? 'el siguiente es gratis' : `tenés ${rule.discountPercent} % de descuento en el siguiente`
  const expiry = rule.expiryMonths === null ? 'Los sellos no vencen.' : `Los sellos vencen a los ${rule.expiryMonths} meses.`
  return `Cada ${rule.every} day use, ${reward}. ${expiry}`
}

export type LoyaltySettings = {
  loyalty_enabled: boolean
  loyalty_every: number
  loyalty_discount_percent: number
  loyalty_expiry_months: number | null
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as the clubs check constraints, with a Spanish message for each.
export function parseLoyaltyForm(form: FormData): ParseResult<LoyaltySettings> {
  const every = readInt(form, 'loyalty_every', { min: 1, max: 50 })
  if (every === null) return fail('Los day use para la recompensa van de 1 a 50.')
  const percent = readInt(form, 'loyalty_discount_percent', { min: 1, max: 100 })
  if (percent === null) return fail('El descuento va de 1 a 100 %.')
  const never = form.get('loyalty_expiry_months') === 'never'
  const expiry = never ? null : readInt(form, 'loyalty_expiry_months', { min: 1, max: 36 })
  if (!never && expiry === null) return fail('Elegí cuándo vencen los sellos.')
  return {
    ok: true,
    value: {
      loyalty_enabled: readBoolean(form, 'loyalty_enabled'),
      loyalty_every: every,
      loyalty_discount_percent: percent,
      loyalty_expiry_months: expiry,
    },
  }
}
