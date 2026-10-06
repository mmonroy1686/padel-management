import { describe, expect, it } from 'vitest'
import { daySlots } from '@/lib/domain/slots'
import {
  countdownText,
  courtsText,
  holdText,
  notificationText,
  readNotificationData,
  shortTime,
  toWait,
  unreadLabel,
  waitCovers,
  waitItems,
  waitRangeOptions,
  waitRangeText,
  waitText,
} from '@/lib/domain/waitlist'
import { at, COURTS, DATE, SCHEDULE, TIMEZONE } from '../../fixtures/grid'

// DATE is Thursday 2026-10-01; 2026-10-03 is a Saturday.
const SATURDAY = '2026-10-03'
const THREE_COURTS = [...COURTS, { id: 'court-3', name: 'Cancha 3', isCovered: true }]
const WAIT = toWait({ id: 'w1', on_date: SATURDAY, from_time: '18:30:00', to_time: '21:30:00', court_ids: [] })

describe('waits', () => {
  it('reads Postgres times as HH:MM, midnight included', () => {
    expect(shortTime('18:30:00')).toBe('18:30')
    expect(toWait({ id: 'w2', on_date: SATURDAY, from_time: '20:00:00', to_time: '24:00:00', court_ids: ['court-1'] })).toEqual({
      id: 'w2',
      date: SATURDAY,
      fromTime: '20:00',
      toTime: '24:00',
      courtIds: ['court-1'],
    })
  })

  it('names the courts a player waits for', () => {
    expect(courtsText([], COURTS)).toBe('cualquier cancha')
    expect(courtsText(['court-2'], COURTS)).toBe('Cancha 2')
    expect(courtsText(['court-2', 'court-1'], COURTS)).toBe('Cancha 1 y Cancha 2')
    expect(courtsText(['court-1', 'court-2', 'court-3'], THREE_COURTS)).toBe('Cancha 1, Cancha 2 y Cancha 3')
  })

  it('describes a wait for the player and for the club', () => {
    expect(waitText(WAIT, COURTS, DATE)).toBe('sáb 3, de 18:30 a 21:30, cualquier cancha')
    expect(waitText(WAIT, COURTS, SATURDAY)).toBe('Hoy, de 18:30 a 21:30, cualquier cancha')
    expect(waitRangeText({ ...WAIT, courtIds: ['court-2'] }, COURTS)).toBe('de 18:30 a 21:30, Cancha 2')
    expect(waitItems([WAIT], COURTS, DATE)).toEqual([{ id: 'w1', text: 'sáb 3, de 18:30 a 21:30, cualquier cancha' }])
  })

  it('offers the starts and ends of the slots still ahead', () => {
    expect(waitRangeOptions(daySlots(SCHEDULE, DATE), at('19:00'))).toEqual({
      from: [
        { value: '20:00', label: '20:00' },
        { value: '21:30', label: '21:30' },
      ],
      to: [
        { value: '21:30', label: '21:30' },
        { value: '23:00', label: '23:00' },
      ],
    })
  })
})

describe('waitCovers', () => {
  const slots = daySlots(SCHEDULE, SATURDAY)
  const slot = (label: string) => slots.find((item) => item.label === label)!

  it('covers the slots that start and end inside the range, on that day', () => {
    expect(['17:00', '18:30', '20:00', '21:30'].map((label) => waitCovers(WAIT, SATURDAY, 'court-1', slot(label)))).toEqual([
      false,
      true,
      true,
      false,
    ])
    expect(waitCovers(WAIT, DATE, 'court-1', slot('18:30'))).toBe(false)
  })

  it('only on the courts it names, or on any when it names none', () => {
    const onCourt2 = { ...WAIT, courtIds: ['court-2'] }
    expect(waitCovers(onCourt2, SATURDAY, 'court-1', slot('18:30'))).toBe(false)
    expect(waitCovers(onCourt2, SATURDAY, 'court-2', slot('18:30'))).toBe(true)
  })
})

describe('holds', () => {
  const hold = { courtName: 'Cancha 2', startsAt: at('19:00', SATURDAY) }

  it('says which court was freed and when', () => {
    expect(holdText(hold, TIMEZONE, DATE)).toBe('Se liberó la Cancha 2, sáb 3 a las 19:00.')
    expect(holdText(hold, TIMEZONE, SATURDAY)).toBe('Se liberó la Cancha 2, hoy a las 19:00.')
  })

  it('counts down in minutes and seconds, never below zero', () => {
    const now = new Date('2026-10-03T20:00:00Z')
    expect(countdownText(new Date(now.getTime() + 754_000), now)).toBe('12:34')
    expect(countdownText(new Date(now.getTime() + 59_500), now)).toBe('00:59')
    expect(countdownText(new Date(now.getTime() - 1_000), now)).toBe('00:00')
  })
})

describe('avisos', () => {
  const held = {
    court_name: 'Cancha 2',
    starts_at: at('19:00', SATURDAY).toISOString(),
    expires_at: at('17:42', SATURDAY).toISOString(),
  }

  it('reads what the database wrote, and nothing else', () => {
    expect(readNotificationData(held)).toEqual({
      courtName: 'Cancha 2',
      startsAt: at('19:00', SATURDAY),
      expiresAt: at('17:42', SATURDAY),
    })
    expect(readNotificationData({ court_name: 'Cancha 2', starts_at: held.starts_at })?.expiresAt).toBeNull()
    expect(readNotificationData({ court_name: 'Cancha 2' })).toBeNull()
    expect(readNotificationData(['Cancha 2'])).toBeNull()
    expect(readNotificationData(null)).toBeNull()
  })

  it('words a held slot and a slot free right now', () => {
    const data = readNotificationData(held)!
    expect(notificationText('slot_held', data, TIMEZONE)).toEqual({
      title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
      body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
    })
    expect(notificationText('slot_free_now', data, TIMEZONE)).toEqual({
      title: 'Se liberó la Cancha 2 a las 19:00: el primero que reserva se la queda',
      body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
    })
  })

  it('labels the bell with what is unread', () => {
    expect(unreadLabel(0)).toBe('Avisos')
    expect(unreadLabel(1)).toBe('Avisos, 1 sin leer')
    expect(unreadLabel(3)).toBe('Avisos, 3 sin leer')
  })
})
