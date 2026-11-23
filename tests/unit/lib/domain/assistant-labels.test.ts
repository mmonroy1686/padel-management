import { describe, expect, it } from 'vitest'
import { capitalize, formatPhone, shortDate } from '@/lib/domain/format'
import { categorySlashLabel } from '@/lib/domain/matches'

describe('assistant labels', () => {
  it('writes a day as day/month', () => {
    expect(shortDate('2026-11-24')).toBe('24/11')
    expect(shortDate('2026-10-01')).toBe('1/10')
  })

  it('groups the phone digits the way people write them', () => {
    expect(formatPhone('092369558')).toBe('092 369 558')
    expect(formatPhone('29001234')).toBe('2900 1234')
    expect(formatPhone('59899123456')).toBe('59899123456')
  })

  it('capitalizes the first letter', () => {
    expect(capitalize('martes')).toBe('Martes')
    expect(capitalize('')).toBe('')
  })

  it('writes a range of categories in short', () => {
    expect(categorySlashLabel(5, 6)).toBe('5ª/6ª')
    expect(categorySlashLabel(5, 5)).toBe('5ª')
  })
})
