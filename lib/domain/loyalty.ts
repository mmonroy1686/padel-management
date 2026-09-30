import type { PassStatus } from './day-use'
import { readBoolean, readInt } from './input'
import type { ParseResult } from './settings'
import { parseLocalDate, type LocalDate } from './time'

export type LoyaltyRule = { enabled: boolean; every: number; discountPercent: number; expiryMonths: number | null }
export type LoyaltyPass = { date: LocalDate; status: PassStatus; usedReward: boolean }
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

// Same as private.loyalty_of: a stamp is a check-in without a reward inside the expiry window;
// every `every` stamps earn a reward; every pass bought with one (not cancelled) uses it.
export function loyaltyOf(passes: LoyaltyPass[], rule: LoyaltyRule, today: LocalDate): Loyalty {
  if (!rule.enabled) return NO_LOYALTY
  const since = loyaltySince(rule, today)
  const inWindow = passes.filter((pass) => since === null || pass.date >= since)
  const stamps = inWindow.filter((pass) => pass.status === 'inside' && !pass.usedReward).length
  const used = inWindow.filter((pass) => pass.status !== 'cancelled' && pass.usedReward).length
  const earned = Math.floor(stamps / rule.every)
  return { stamps, earned, used, available: Math.max(0, earned - used), progress: stamps % rule.every }
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
