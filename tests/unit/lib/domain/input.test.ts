import { describe, expect, it } from 'vitest'
import {
  isLocalDate,
  isUuid,
  readBoolean,
  readEnum,
  readInstant,
  readInt,
  readLocalDate,
  readText,
  readTime,
  readUuid,
} from '@/lib/domain/input'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

const ID = '22222222-2222-2222-2222-222222222201'

describe('readUuid', () => {
  it('accepts a uuid and normalizes its case', () => {
    expect(readUuid(form({ id: ID.toUpperCase() }), 'id')).toBe(ID)
  })

  it('rejects anything else', () => {
    expect(readUuid(form({ id: 'cancha-1' }), 'id')).toBeNull()
    expect(readUuid(form({}), 'id')).toBeNull()
    expect(isUuid(42)).toBe(false)
  })
})

describe('readInstant', () => {
  it('accepts ISO instants with a zone and returns them in UTC', () => {
    expect(readInstant(form({ at: '2026-10-01T11:00:00.000Z' }), 'at')).toBe('2026-10-01T11:00:00.000Z')
    expect(readInstant(form({ at: '2026-10-01T08:00:00-03:00' }), 'at')).toBe('2026-10-01T11:00:00.000Z')
  })

  it('rejects instants without a zone and text', () => {
    expect(readInstant(form({ at: '2026-10-01T08:00' }), 'at')).toBeNull()
    expect(readInstant(form({ at: 'mañana' }), 'at')).toBeNull()
  })
})

describe('readInt', () => {
  it('reads whole numbers inside the range', () => {
    expect(readInt(form({ n: '1600' }), 'n', { min: 1, max: 10000 })).toBe(1600)
  })

  it('rejects out of range, decimals and text', () => {
    expect(readInt(form({ n: '0' }), 'n', { min: 1, max: 10 })).toBeNull()
    expect(readInt(form({ n: '3.5' }), 'n', { min: 1, max: 10 })).toBeNull()
    expect(readInt(form({ n: 'tres' }), 'n', { min: 1, max: 10 })).toBeNull()
  })
})

describe('readText', () => {
  it('trims and limits length', () => {
    expect(readText(form({ name: '  Rodríguez ' }), 'name', { maxLength: 60 })).toBe('Rodríguez')
    expect(readText(form({ name: '   ' }), 'name', { maxLength: 60 })).toBeNull()
    expect(readText(form({ name: 'x'.repeat(61) }), 'name', { maxLength: 60 })).toBeNull()
  })
})

describe('readEnum, readTime and readBoolean', () => {
  it('accepts only listed values', () => {
    expect(readEnum(form({ side: 'drive' }), 'side', ['drive', 'backhand'] as const)).toBe('drive')
    expect(readEnum(form({ side: 'center' }), 'side', ['drive', 'backhand'] as const)).toBeNull()
  })

  it('reads HH:MM times up to 24:00', () => {
    expect(readTime(form({ t: '08:00' }), 't')).toBe('08:00')
    expect(readTime(form({ t: '24:00' }), 't')).toBe('24:00')
    expect(readTime(form({ t: '24:30' }), 't')).toBeNull()
    expect(readTime(form({ t: '8:00' }), 't')).toBeNull()
  })

  it('reads checkboxes', () => {
    expect(readBoolean(form({ cash: 'on' }), 'cash')).toBe(true)
    expect(readBoolean(form({}), 'cash')).toBe(false)
  })
})

describe('local dates', () => {
  it('accepts real calendar dates only', () => {
    expect(isLocalDate('2026-10-01')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('hoy')).toBe(false)
    expect(isLocalDate(undefined)).toBe(false)
    expect(readLocalDate(form({ d: '2026-10-01' }), 'd')).toBe('2026-10-01')
  })
})
