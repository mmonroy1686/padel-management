import { describe, expect, it } from 'vitest'
import {
  buyStatus,
  canCancelPass,
  dayUseDays,
  firstOpenDay,
  includesText,
  isOpenOn,
  isPassCode,
  passCheckInPath,
  passTotal,
  scheduleText,
  searchPasses,
  skippedNotice,
  spotsText,
  todayText,
  toPass,
  toProduct,
  unblockedCourts,
  type BuyContext,
  type PassRow,
} from '@/lib/domain/day-use'
import { at, DATE, TIMEZONE } from '../../fixtures/grid'
import { makePass, makeProduct } from '../../fixtures/day-use'

const CONTEXT: BuyContext = { now: at('07:00'), today: DATE, timezone: TIMEZONE, windowDays: 14, sold: 0, hasPass: false }

describe('toProduct', () => {
  it('reads a row with the times as HH:MM', () => {
    expect(
      toProduct({
        id: 'p1',
        name: 'Day use completo',
        price: 450,
        includes: ['Vestuarios'],
        weekdays: [6, 0],
        from_time: '08:00:00',
        to_time: '24:00:00',
        capacity: 30,
        court_ids: ['court-1'],
        is_active: true,
        sort_order: 2,
      }),
    ).toEqual(makeProduct({ includes: ['Vestuarios'], weekdays: [6, 0], toTime: '24:00', courtIds: ['court-1'], sortOrder: 2 }))
  })
})

describe('isOpenOn and dayUseDays', () => {
  const weekend = makeProduct({ weekdays: [6, 0] })

  it('follows the weekdays, unless an exception says otherwise', () => {
    expect(isOpenOn(weekend, '2026-10-03', [])).toBe(true)
    expect(isOpenOn(weekend, DATE, [])).toBe(false)
    expect(isOpenOn(weekend, DATE, [{ productId: 'p1', date: DATE, enabled: true }])).toBe(true)
    expect(isOpenOn(weekend, '2026-10-03', [{ productId: 'p1', date: '2026-10-03', enabled: false }])).toBe(false)
    expect(isOpenOn(weekend, DATE, [{ productId: 'other', date: DATE, enabled: true }])).toBe(false)
    expect(isOpenOn(makeProduct({ isActive: false }), DATE, [])).toBe(false)
  })

  it('lists the coming days and marks the ones without day use', () => {
    expect(dayUseDays(DATE, [weekend], [], 3)).toEqual([
      { date: '2026-10-01', label: 'Hoy', closed: true },
      { date: '2026-10-02', label: 'Mañana', closed: true },
      { date: '2026-10-03', label: 'sáb 3', closed: false },
    ])
    expect(dayUseDays(DATE, [weekend], [{ productId: 'p1', date: '2026-10-02', enabled: true }], 2)[1].closed).toBe(false)
  })
})

describe('texts', () => {
  it('says the hours, what it includes and how many spots are left', () => {
    expect(scheduleText(makeProduct())).toBe('08:00 a 12:30')
    expect(includesText(['Vestuarios', 'Pileta', 'Cancha libre'])).toBe('Vestuarios, Pileta y Cancha libre')
    expect(spotsText(30, 12)).toBe('Quedan 18 de 30')
    expect(spotsText(30, 29)).toBe('Queda 1 de 30')
    expect(spotsText(30, 30)).toBe('Sin lugares')
  })

  it('sums today for Inicio, or says nothing when no pass runs today', () => {
    const sold = [{ productId: 'p1', date: DATE, sold: 12, inside: 5 }]
    expect(todayText([makeProduct()], [], sold, DATE)).toBe('Hoy: 5 en el club, quedan 18 lugares')
    expect(todayText([makeProduct({ capacity: 13 })], [], sold, DATE)).toBe('Hoy: 5 en el club, queda 1 lugar')
    expect(todayText([makeProduct({ weekdays: [6, 0] })], [], sold, DATE)).toBeNull()
  })

  it('warns about courts that were taken when saving', () => {
    expect(skippedNotice(0)).toBe('')
    expect(skippedNotice(1)).toBe(' Una cancha ya estaba ocupada un día y no se bloqueó: mirá los avisos.')
    expect(skippedNotice(3)).toBe(' 3 veces una cancha ya estaba ocupada y no se bloqueó: mirá los avisos.')
  })
})

describe('passTotal', () => {
  it('takes the reward off like the database, rounding down', () => {
    expect(passTotal(450, 0)).toBe(450)
    expect(passTotal(450, 50)).toBe(225)
    expect(passTotal(455, 50)).toBe(227)
    expect(passTotal(450, 100)).toBe(0)
  })
})

describe('buyStatus', () => {
  it('lets the player buy, with the price', () => {
    expect(buyStatus(makeProduct(), DATE, [], CONTEXT)).toEqual({ ok: true, text: 'Comprar pase, $450' })
    expect(buyStatus(makeProduct({ price: 0 }), DATE, [], CONTEXT)).toEqual({ ok: true, text: 'Comprar pase' })
  })

  it('says why not, in the same order as the database', () => {
    const text = (date: string, overrides: Partial<BuyContext> = {}, product = makeProduct()) =>
      buyStatus(product, date, [], { ...CONTEXT, ...overrides }).text
    expect(text(DATE, { hasPass: true })).toBe('Ya tenés este pase.')
    expect(text('2026-09-30')).toBe('Ese día ya pasó.')
    expect(text('2026-10-16')).toBe('Todavía no se vende para ese día.')
    expect(text(DATE, {}, makeProduct({ weekdays: [6, 0] }))).toBe('Ese día no hay day use.')
    expect(text(DATE, { now: at('12:30') })).toBe('El horario de hoy ya terminó.')
    expect(text(DATE, { sold: 30 })).toBe('No quedan lugares.')
  })
})

describe('toPass', () => {
  const ROW: PassRow = {
    id: 'pass-1',
    code: 'DU-482193',
    product_id: 'p1',
    on_date: '2026-10-01',
    player_id: 'ana',
    guest_name: null,
    price: 450,
    discount_percent: 50,
    used_reward: true,
    total: 225,
    status: 'inside',
    source: 'reception',
    checked_in_at: '2026-10-01T13:12:00+00:00',
    product: { name: 'Day use completo', from_time: '08:00:00', to_time: '12:30:00' },
    player: { display_name: 'Ana Pérez' },
    payments: [],
  }

  it('reads a pass with its hours on the club clock', () => {
    expect(toPass(ROW, TIMEZONE)).toEqual(
      makePass({
        discountPercent: 50,
        usedReward: true,
        total: 225,
        status: 'inside',
        source: 'reception',
        checkedInAt: new Date('2026-10-01T13:12:00Z'),
      }),
    )
  })

  it('names guests and private profiles, and computes a missing total', () => {
    expect(toPass({ ...ROW, player_id: null, player: null, guest_name: 'Pepe', discount_percent: 0, used_reward: false, total: null }, TIMEZONE))
      .toMatchObject({ holder: 'Pepe', isGuest: true, total: 450 })
    expect(toPass({ ...ROW, player: null }, TIMEZONE).holder).toBe('Jugador')
  })
})

describe('passes', () => {
  it('lets the player cancel a pass until its day use ends, like cancel_day_use', () => {
    expect(canCancelPass(makePass(), at('12:00'))).toBe(true)
    expect(canCancelPass(makePass(), at('12:30'))).toBe(false)
    expect(canCancelPass(makePass({ status: 'inside' }), at('09:00'))).toBe(false)
    expect(canCancelPass(makePass({ status: 'cancelled' }), at('09:00'))).toBe(false)
  })

  it('finds passes by name, without accents, or by code', () => {
    const passes = [makePass(), makePass({ id: 'pass-2', code: 'DU-100200', holder: 'Bruno Díaz', playerId: 'bruno' })]
    expect(searchPasses(passes, 'bru').map((pass) => pass.id)).toEqual(['pass-2'])
    expect(searchPasses(passes, 'PEREZ').map((pass) => pass.id)).toEqual(['pass-1'])
    expect(searchPasses(passes, 'du-1002').map((pass) => pass.id)).toEqual(['pass-2'])
    expect(searchPasses(passes, '  ')).toHaveLength(2)
  })

  it('knows a pass code and where its QR leads', () => {
    expect(isPassCode('DU-482193')).toBe(true)
    expect(isPassCode('DU-48219')).toBe(false)
    expect(isPassCode('du-482193')).toBe(false)
    expect(passCheckInPath('DU-482193')).toBe('/club/day-use/pase/DU-482193')
  })
})

describe('unblockedCourts', () => {
  const product = makeProduct({ courtIds: ['court-1', 'court-2'] })
  const occupancies = [
    { courtId: 'court-1', dayUseProductId: 'p1', startsAt: at('08:00') },
    { courtId: 'court-1', dayUseProductId: 'p1', startsAt: at('08:00', '2026-10-02') },
    { courtId: 'court-2', dayUseProductId: 'p1', startsAt: at('08:00', '2026-10-02') },
    { courtId: 'court-2', dayUseProductId: 'other', startsAt: at('08:00') },
  ]

  it('lists the court-days the pass should block and does not', () => {
    expect(unblockedCourts(product, [DATE, '2026-10-02'], [], occupancies, at('07:00'), TIMEZONE)).toEqual([
      { productId: 'p1', date: DATE, courtId: 'court-2' },
    ])
  })

  it('leaves out what already started and the days it does not run', () => {
    expect(unblockedCourts(product, [DATE, '2026-10-02'], [], occupancies, at('09:00'), TIMEZONE)).toEqual([])
    expect(unblockedCourts(product, ['2026-10-03'], [{ productId: 'p1', date: '2026-10-03', enabled: false }], [], at('07:00'), TIMEZONE)).toEqual([])
  })
})

describe('firstOpenDay', () => {
  // DATE is a Thursday; the pass runs 08:00 to 12:30 on Thursdays and Saturdays.
  const products = [makeProduct({ weekdays: [4, 6] })]

  it("is today while today's day use has not ended", () => {
    expect(firstOpenDay(DATE, products, [], at('12:00'), TIMEZONE)).toBe(DATE)
  })

  it("is the next day with day use once today's ended, counting the exceptions", () => {
    expect(firstOpenDay(DATE, products, [], at('13:00'), TIMEZONE)).toBe('2026-10-03')
    const friday = [{ productId: 'p1', date: '2026-10-02', enabled: true }]
    expect(firstOpenDay(DATE, products, friday, at('13:00'), TIMEZONE)).toBe('2026-10-02')
  })

  it('stays on today when no day of the week has day use', () => {
    expect(firstOpenDay(DATE, [], [], at('13:00'), TIMEZONE)).toBe(DATE)
  })
})
