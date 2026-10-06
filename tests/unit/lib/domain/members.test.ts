import { describe, expect, it } from 'vitest'
import { normalizeText } from '@/lib/domain/members'

describe('normalizeText', () => {
  it('drops accents, case and outer spaces', () => {
    expect(normalizeText('  LÓPEZ ')).toBe('lopez')
    expect(normalizeText('Martín')).toBe('martin')
  })
})
