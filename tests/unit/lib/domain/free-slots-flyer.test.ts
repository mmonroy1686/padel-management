import { describe, expect, it } from 'vitest'
import { flyerContact, flyerDayText, flyerLayout, flyerText, hasFreeSlots } from '@/lib/domain/free-slots-flyer'
import { buildDayGrid } from '@/lib/domain/grid'
import { daySlots } from '@/lib/domain/slots'
import { at, DATE, makeGrid, occupancy, RULES, SCHEDULE } from '../../fixtures/grid'

describe('flyerLayout', () => {
  it('has the active courts as columns and the times still to come as rows', () => {
    const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '17:00', '18:30')], now: at('12:00') }))
    expect(layout.columns).toEqual([
      { courtId: 'court-1', name: 'Cancha 1' },
      { courtId: 'court-2', name: 'Cancha 2' },
    ])
    expect(layout.rows.map((row) => row.label)).toEqual(['12:30', '14:00', '15:30', '17:00', '18:30', '20:00', '21:30'])
    expect(layout.rows[3].cells).toEqual(['free', 'taken'])
    expect(layout).toMatchObject({ narrow: false, compact: false })
  })

  it('marks a time without a price as no slot', () => {
    expect(flyerLayout(makeGrid({ rules: [RULES[0]] })).rows.at(-1)?.cells).toEqual(['none', 'none'])
  })

  it('uses smaller pills past 8 times and narrow columns from 6 courts', () => {
    expect(flyerLayout(makeGrid()).compact).toBe(true)
    const courts = Array.from({ length: 6 }, (_, index) => ({ id: `court-${index + 1}`, name: `Cancha ${index + 1}`, isCovered: true }))
    const wide = buildDayGrid({ date: DATE, slots: daySlots(SCHEDULE, DATE), courts, rules: RULES, occupancies: [], bookings: [], now: at('07:00') })
    expect(flyerLayout(wide).narrow).toBe(true)
  })
})

describe('flyerText', () => {
  const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '20:00', '21:30')], now: at('17:30') }))

  it('lists only the free times of each court, with the link and the WhatsApp', () => {
    expect(flyerText({ date: DATE, layout, url: 'https://rustic.app', phone: '092369558' })).toBe(
      [
        '🎾 Turnos libres — jueves 1/10',
        'Cancha 1: 18:30 · 20:00 · 21:30',
        'Cancha 2: 18:30 · 21:30',
        'Reservá: https://rustic.app · WhatsApp 092 369 558',
      ].join('\n'),
    )
  })

  it('goes without the WhatsApp when the club has none, and says when nothing is left', () => {
    const none = flyerLayout(makeGrid({ now: at('22:00') }))
    expect(hasFreeSlots(none)).toBe(false)
    expect(hasFreeSlots(layout)).toBe(true)
    expect(flyerText({ date: DATE, layout: none, url: 'https://rustic.app', phone: null })).toBe(
      ['🎾 Turnos libres — jueves 1/10', 'No quedan turnos libres este día.', 'Reservá: https://rustic.app'].join('\n'),
    )
  })
})

describe('flyer words', () => {
  it('names the day and the contact', () => {
    expect(flyerDayText(DATE)).toBe('jueves 1/10')
    expect(flyerContact('092369558')).toBe('Consultanos: 092 369 558')
    // Without a WhatsApp the flyer shows only the club's mark and name: never the web link.
    expect(flyerContact(null)).toBeNull()
  })
})
