import { describe, expect, it } from 'vitest'
import {
  loyaltyOf,
  loyaltyRuleOf,
  loyaltyRuleText,
  monthsBefore,
  NO_LOYALTY,
  parseLoyaltyForm,
  rewardLabel,
  stampsText,
  type LoyaltyPass,
  type LoyaltyRule,
} from '@/lib/domain/loyalty'

const RULE: LoyaltyRule = { enabled: true, every: 5, discountPercent: 100, expiryMonths: 6 }
const TODAY = '2026-10-01'
const visit = (date: string): LoyaltyPass => ({ date, status: 'inside', usedReward: false })

describe('monthsBefore', () => {
  it('goes back whole months like Postgres, keeping the day or the last one of the month', () => {
    expect(monthsBefore('2026-10-01', 6)).toBe('2026-04-01')
    expect(monthsBefore('2026-08-31', 6)).toBe('2026-02-28')
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15')
  })
})

describe('loyaltyOf', () => {
  const passes: LoyaltyPass[] = [
    ...['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-04-01'].map(visit),
    visit('2026-03-31'),
    { date: '2026-10-02', status: 'bought', usedReward: true },
    { date: '2026-10-03', status: 'cancelled', usedReward: true },
    { date: '2026-09-30', status: 'inside', usedReward: true },
  ]

  it('counts stamps inside the expiry, rewards earned, used and left, like private.loyalty_of', () => {
    expect(loyaltyOf(passes, RULE, TODAY)).toEqual({ stamps: 6, earned: 1, used: 2, available: 0, progress: 1 })
  })

  it('counts every check-in when stamps never expire', () => {
    expect(loyaltyOf(passes, { ...RULE, expiryMonths: null }, TODAY)).toMatchObject({ stamps: 7, earned: 1 })
  })

  it('has a reward once a group of stamps is complete and unused', () => {
    expect(loyaltyOf(['2026-09-01', '2026-09-02', '2026-09-03'].map(visit), { ...RULE, every: 3 }, TODAY)).toEqual({
      stamps: 3,
      earned: 1,
      used: 0,
      available: 1,
      progress: 0,
    })
  })

  it('is empty while the club has stamps off', () => {
    expect(loyaltyOf(passes, { ...RULE, enabled: false }, TODAY)).toEqual(NO_LOYALTY)
  })
})

describe('texts', () => {
  it('explains the rule in words', () => {
    expect(loyaltyRuleText(RULE)).toBe('Cada 5 day use, el siguiente es gratis. Los sellos vencen a los 6 meses.')
    expect(loyaltyRuleText({ ...RULE, every: 3, discountPercent: 50, expiryMonths: null })).toBe(
      'Cada 3 day use, tenés 50 % de descuento en el siguiente. Los sellos no vencen.',
    )
    expect(loyaltyRuleText({ ...RULE, enabled: false })).toBe('')
  })

  it('labels the reward and the progress', () => {
    expect(rewardLabel(100)).toBe('-100%')
    expect(stampsText({ ...NO_LOYALTY, progress: 3 }, RULE)).toBe('3 de 5 sellos')
  })

  it('reads the rule from the club row', () => {
    expect(
      loyaltyRuleOf({ loyalty_enabled: true, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: 6 }),
    ).toEqual(RULE)
  })
})

describe('parseLoyaltyForm', () => {
  function loyaltyForm(entries: Record<string, string>): FormData {
    const form = new FormData()
    for (const [key, value] of Object.entries(entries)) form.set(key, value)
    return form
  }
  const VALID = { loyalty_enabled: 'on', loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: '6' }

  it('reads the rule as the clubs columns', () => {
    expect(parseLoyaltyForm(loyaltyForm(VALID))).toEqual({
      ok: true,
      value: { loyalty_enabled: true, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: 6 },
    })
    const off = { loyalty_every: '5', loyalty_discount_percent: '100', loyalty_expiry_months: 'never' }
    expect(parseLoyaltyForm(loyaltyForm(off))).toEqual({
      ok: true,
      value: { loyalty_enabled: false, loyalty_every: 5, loyalty_discount_percent: 100, loyalty_expiry_months: null },
    })
  })

  it('explains each mistake in Spanish', () => {
    const message = (overrides: Record<string, string>) => {
      const result = parseLoyaltyForm(loyaltyForm({ ...VALID, ...overrides }))
      return result.ok ? null : result.message
    }
    expect(message({ loyalty_every: '0' })).toBe('Los day use para la recompensa van de 1 a 50.')
    expect(message({ loyalty_discount_percent: '120' })).toBe('El descuento va de 1 a 100 %.')
    expect(message({ loyalty_expiry_months: '40' })).toBe('Elegí cuándo vencen los sellos.')
  })
})
