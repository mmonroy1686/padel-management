import { describe, expect, it } from 'vitest'
import { categoryLabel, firstName, GENDER_LABELS, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'

describe('isProfileComplete', () => {
  const profile = { side: 'drive', hand: 'right', gender: 'female' }

  it('needs side, hand, gender and a category in the club', () => {
    expect(isProfileComplete(profile, { category: 5 })).toBe(true)
  })

  it('sends people without them to the welcome form, also those who joined before gender existed', () => {
    expect(isProfileComplete({ ...profile, side: null }, { category: 5 })).toBe(false)
    expect(isProfileComplete({ ...profile, gender: null }, { category: 5 })).toBe(false)
    expect(isProfileComplete(profile, { category: null })).toBe(false)
    expect(isProfileComplete(profile, null)).toBe(false)
  })
})

describe('GENDER_LABELS', () => {
  it('names genders in Spanish', () => {
    expect(GENDER_LABELS).toEqual({ male: 'Masculino', female: 'Femenino' })
  })
})

describe('labels', () => {
  it('names categories and whether the club validated them', () => {
    expect(categoryLabel(5, true)).toBe('5ª categoría, validada')
    expect(categoryLabel(5, false)).toBe('5ª categoría, pendiente de validación')
    expect(categoryLabel(null, false)).toBe('Sin categoría')
  })

  it('names sides in Spanish', () => {
    expect(SIDE_LABELS).toEqual({ drive: 'Drive', backhand: 'Revés', both: 'Ambos lados' })
  })

  it('greets by first name', () => {
    expect(firstName('Lucía Gómez')).toBe('Lucía')
    expect(firstName('  ')).toBe('')
  })
})

describe('isStaffRole', () => {
  it('is true for reception and admin only', () => {
    expect(isStaffRole('admin')).toBe(true)
    expect(isStaffRole('reception')).toBe(true)
    expect(isStaffRole('player')).toBe(false)
    expect(isStaffRole(null)).toBe(false)
  })
})
