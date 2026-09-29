import { describe, expect, it } from 'vitest'
import { seriesCreatedMessage, shortDate, SKIP_REASON_LABELS } from '@/lib/domain/series'

describe('shortDate', () => {
  it('writes the weekday and day/month', () => {
    expect(shortDate('2026-10-15')).toBe('jue 15/10')
  })
})

describe('seriesCreatedMessage', () => {
  it('confirms the series when every date was free', () => {
    expect(seriesCreatedMessage([])).toBe('Turno fijo cargado para las próximas 8 semanas.')
  })

  it('lists the dates it had to skip and why', () => {
    expect(
      seriesCreatedMessage([
        { on_date: '2026-10-15', reason: 'slot_taken' },
        { on_date: '2026-10-22', reason: 'no_price' },
      ]),
    ).toBe('Turno fijo cargado. Salteamos 2 fechas: jue 15/10 (la cancha estaba ocupada), jue 22/10 (no había precio).')
  })

  it('names every skip reason', () => {
    expect(Object.keys(SKIP_REASON_LABELS).sort()).toEqual(['court_inactive', 'no_price', 'not_aligned', 'slot_taken'])
  })
})
