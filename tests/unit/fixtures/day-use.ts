import type { DayUsePass, DayUseProduct } from '@/lib/domain/day-use'
import { at, DATE } from './grid'

// Every day 08:00 to 12:30, for 30 people, $450, blocks no court.
export function makeProduct(overrides: Partial<DayUseProduct> = {}): DayUseProduct {
  return {
    id: 'p1',
    name: 'Day use completo',
    price: 450,
    includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    fromTime: '08:00',
    toTime: '12:30',
    capacity: 30,
    courtIds: [],
    isActive: true,
    sortOrder: 1,
    ...overrides,
  }
}

// Ana's pass for the grid fixture's day (Thursday 2026-10-01), bought online, not paid yet.
export function makePass(overrides: Partial<DayUsePass> = {}): DayUsePass {
  return {
    id: 'pass-1',
    code: 'DU-482193',
    productId: 'p1',
    productName: 'Day use completo',
    date: DATE,
    startsAt: at('08:00'),
    endsAt: at('12:30'),
    playerId: 'ana',
    holder: 'Ana Pérez',
    isGuest: false,
    price: 450,
    discountPercent: 0,
    usedReward: false,
    total: 450,
    status: 'bought',
    source: 'online',
    checkedInAt: null,
    payments: [],
    ...overrides,
  }
}
