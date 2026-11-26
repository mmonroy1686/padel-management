import { describe, expect, it } from 'vitest'
import { freeTodayText, nextFreeLabel } from '@/lib/domain/next-free'

const TODAY = '2026-11-26'

describe('freeTodayText', () => {
  it("says today's free slots", () => {
    expect(freeTodayText(1, null, TODAY)).toBe('1 turno libre hoy')
    expect(freeTodayText(6, null, TODAY)).toBe('6 turnos libres hoy')
  })

  it('with today full, names the next free slot instead of a dead end', () => {
    const next = { date: '2026-11-27', time: '18:30', courtName: 'Cancha 2', free: 6 }
    expect(freeTodayText(0, next, TODAY)).toBe('Hoy está lleno. Próximo libre: mañana 18:30, Cancha 2')
    expect(freeTodayText(0, null, TODAY)).toBe('No quedan turnos esta semana')
  })
})

describe('nextFreeLabel', () => {
  it('offers the next day with room and how many are free', () => {
    expect(nextFreeLabel({ date: '2026-11-27', time: '18:30', courtName: 'Cancha 2', free: 6 }, TODAY)).toBe('Ver mañana (6 libres)')
    expect(nextFreeLabel({ date: '2026-11-28', time: '08:00', courtName: 'Cancha 1', free: 1 }, TODAY)).toBe('Ver sáb 28 (1 libre)')
  })
})
