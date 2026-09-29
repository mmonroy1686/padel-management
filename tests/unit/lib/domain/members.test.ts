import { describe, expect, it } from 'vitest'
import { filterMembers, normalizeText, type MemberView } from '@/lib/domain/members'

const MEMBERS: MemberView[] = [
  { userId: 'u1', name: 'Martín Pérez', role: 'player', category: 5, validated: true },
  { userId: 'u2', name: 'Ana López', role: 'player', category: 6, validated: false },
  { userId: 'u3', name: 'Carla Ruiz', role: 'reception', category: null, validated: false },
]

describe('filterMembers', () => {
  it('finds people ignoring accents and case', () => {
    expect(filterMembers(MEMBERS, 'martin').map((m) => m.userId)).toEqual(['u1'])
    expect(normalizeText('  LÓPEZ ')).toBe('lopez')
  })

  it('lists categories waiting for validation first, then by name', () => {
    expect(filterMembers(MEMBERS, '').map((m) => m.userId)).toEqual(['u2', 'u3', 'u1'])
  })
})
