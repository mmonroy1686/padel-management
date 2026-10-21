import { describe, expect, it } from 'vitest'
import { normalizeText, searchMembers } from '@/lib/domain/members'

describe('normalizeText', () => {
  it('drops accents, case and outer spaces', () => {
    expect(normalizeText('  LÓPEZ ')).toBe('lopez')
    expect(normalizeText('Martín')).toBe('martin')
  })
})

describe('searchMembers', () => {
  const members = [
    { userId: 'u1', name: 'Martín López' },
    { userId: 'u2', name: 'Martina Pérez' },
    { userId: 'u3', name: 'Lucía Martínez' },
  ]

  it('finds every typed word, without accents or case', () => {
    expect(searchMembers(members, 'martin lop', 8).map((member) => member.userId)).toEqual(['u1'])
    expect(searchMembers(members, 'MARTIN', 8).map((member) => member.userId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('stops at the maximum', () => {
    expect(searchMembers(members, 'mart', 2).map((member) => member.userId)).toEqual(['u1', 'u2'])
  })
})
