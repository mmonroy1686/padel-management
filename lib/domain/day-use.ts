import { dayLabel, formatPrice } from './format'
import type { Loyalty, LoyaltyRule } from './loyalty'
import type { Period } from './matches'
import { courtsText, type EntryPayment } from './tournaments'
import { addDays, formatMinutes, parseTime, toDate, weekdayOf, zonedTime, type LocalDate } from './time'

export type PassStatus = 'bought' | 'inside' | 'cancelled'
export type PassSource = 'online' | 'reception'

export const PASS_STATUS_LABELS: Record<PassStatus, string> = {
  bought: 'Comprado',
  inside: 'Adentro',
  cancelled: 'Cancelado',
}

// What "Nuevo pase" proposes (design, open question: Rustic's real passes).
export const DAY_USE_DEFAULTS = {
  name: 'Day use completo',
  price: 450,
  capacity: 30,
  includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
  weekdays: [6, 0],
  fromTime: '08:00',
  toTime: '12:30',
} as const

// How many days ahead the player's screen and reception's "Vender pase" offer.
export const WEEK_DAYS = 7

export type DayUseProduct = {
  id: string
  name: string
  price: number
  includes: string[]
  weekdays: number[]
  fromTime: string
  toTime: string
  capacity: number
  courtIds: string[]
  isActive: boolean
  sortOrder: number
}

// What lib/data/day-use.ts reads. If supabase-js infers a slightly different shape, adjust these
// types to match; never cast the query result.
export type ProductRow = {
  id: string
  name: string
  price: number
  includes: string[]
  weekdays: number[]
  from_time: string
  to_time: string
  capacity: number
  court_ids: string[]
  is_active: boolean
  sort_order: number
}

const hhmm = (value: string) => formatMinutes(parseTime(value))

export function toProduct(row: ProductRow): DayUseProduct {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    includes: row.includes,
    weekdays: row.weekdays,
    fromTime: hhmm(row.from_time),
    toTime: hhmm(row.to_time),
    capacity: row.capacity,
    courtIds: row.court_ids,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

export type DayUseOverride = { productId: string; date: LocalDate; enabled: boolean }

export function toOverride(row: { product_id: string; on_date: string; enabled: boolean }): DayUseOverride {
  return { productId: row.product_id, date: row.on_date, enabled: row.enabled }
}

// Same rule as private.day_use_open_on: an exception decides; otherwise the weekdays.
export function isOpenOn(
  product: Pick<DayUseProduct, 'id' | 'isActive' | 'weekdays'>,
  date: LocalDate,
  overrides: DayUseOverride[],
): boolean {
  if (!product.isActive) return false
  const override = overrides.find((item) => item.productId === product.id && item.date === date)
  return override ? override.enabled : product.weekdays.includes(weekdayOf(date))
}

export function openProducts<T extends Pick<DayUseProduct, 'id' | 'isActive' | 'weekdays'>>(
  products: T[],
  date: LocalDate,
  overrides: DayUseOverride[],
): T[] {
  return products.filter((product) => isOpenOn(product, date, overrides))
}

export type DayUseDay = { date: LocalDate; label: string; closed: boolean }

// The coming days for the day strip; closed when no pass runs that day.
export function dayUseDays(today: LocalDate, products: DayUseProduct[], overrides: DayUseOverride[], count = WEEK_DAYS): DayUseDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(today, index)
    return { date, label: dayLabel(date, today), closed: openProducts(products, date, overrides).length === 0 }
  })
}

// The day the day use screen opens on: the first day of the week with a pass whose hours have not
// ended yet; today when the week has none.
export function firstOpenDay(
  today: LocalDate,
  products: DayUseProduct[],
  overrides: DayUseOverride[],
  now: Date,
  timezone: string,
  count = WEEK_DAYS,
): LocalDate {
  for (let index = 0; index < count; index++) {
    const date = addDays(today, index)
    if (openProducts(products, date, overrides).some((product) => productPeriod(product, date, timezone).endsAt > now)) return date
  }
  return today
}

export function scheduleText(product: Pick<DayUseProduct, 'fromTime' | 'toTime'>): string {
  return `${product.fromTime} a ${product.toTime}`
}

export function includesText(includes: string[]): string {
  return courtsText(includes)
}

// The pass hours on that date, on the club's clock (private.day_use_period).
export function productPeriod(product: Pick<DayUseProduct, 'fromTime' | 'toTime'>, date: LocalDate, timezone: string): Period {
  return {
    startsAt: zonedTime(date, parseTime(product.fromTime), timezone),
    endsAt: zonedTime(date, parseTime(product.toTime), timezone),
  }
}

export type Sold = { productId: string; date: LocalDate; sold: number; inside: number }

export function toSold(row: { product_id: string; on_date: string; sold: number; inside: number }): Sold {
  return { productId: row.product_id, date: row.on_date, sold: row.sold, inside: row.inside }
}

export function soldOf(sold: Sold[], productId: string, date: LocalDate): { sold: number; inside: number } {
  const row = sold.find((item) => item.productId === productId && item.date === date)
  return { sold: row?.sold ?? 0, inside: row?.inside ?? 0 }
}

export function spotsText(capacity: number, sold: number): string {
  const left = capacity - sold
  if (left <= 0) return 'Sin lugares'
  return `${left === 1 ? 'Queda 1' : `Quedan ${left}`} de ${capacity}`
}

// "Hoy: N en el club, quedan M lugares" for Inicio; null when no pass runs today.
export function todayText(products: DayUseProduct[], overrides: DayUseOverride[], sold: Sold[], today: LocalDate): string | null {
  const open = openProducts(products, today, overrides)
  if (open.length === 0) return null
  const inside = open.reduce((sum, product) => sum + soldOf(sold, product.id, today).inside, 0)
  const left = open.reduce((sum, product) => sum + Math.max(0, product.capacity - soldOf(sold, product.id, today).sold), 0)
  return `Hoy: ${inside} en el club, ${left === 1 ? 'queda 1 lugar' : `quedan ${left} lugares`}`
}

// Appended to what the configuration actions say when a court was already taken.
export function skippedNotice(skipped: number): string {
  if (skipped <= 0) return ''
  if (skipped === 1) return ' Una cancha ya estaba ocupada un día y no se bloqueó: mirá los avisos.'
  return ` ${skipped} veces una cancha ya estaba ocupada y no se bloqueó: mirá los avisos.`
}

// Same as the database's generated total: the price minus the reward, rounded down.
export function passTotal(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100)
}

export type BuyContext = { now: Date; today: LocalDate; timezone: string; windowDays: number; sold: number; hasPass: boolean }
export type BuyStatus = { ok: true; text: string } | { ok: false; text: string }

const no = (text: string): BuyStatus => ({ ok: false, text })

// Same rules and order as private.sell_pass (with "already has it" first, as the cards need it).
export function buyStatus(product: DayUseProduct, date: LocalDate, overrides: DayUseOverride[], context: BuyContext): BuyStatus {
  if (context.hasPass) return no('Ya tenés este pase.')
  if (date < context.today) return no('Ese día ya pasó.')
  if (date > addDays(context.today, context.windowDays)) return no('Todavía no se vende para ese día.')
  if (!isOpenOn(product, date, overrides)) return no('Ese día no hay day use.')
  if (productPeriod(product, date, context.timezone).endsAt <= context.now) return no('El horario de hoy ya terminó.')
  if (context.sold >= product.capacity) return no('No quedan lugares.')
  return { ok: true, text: product.price > 0 ? `Comprar pase, ${formatPrice(product.price)}` : 'Comprar pase' }
}

export type DayUsePass = {
  id: string
  code: string
  productId: string
  productName: string
  date: LocalDate
  startsAt: Date
  endsAt: Date
  playerId: string | null
  holder: string
  isGuest: boolean
  price: number
  discountPercent: number
  usedReward: boolean
  total: number
  status: PassStatus
  source: PassSource
  checkedInAt: Date | null
  // Payments come back only to their payer and to staff (RLS).
  payments: EntryPayment[]
}

export type PassRow = {
  id: string
  code: string
  product_id: string
  on_date: string
  player_id: string | null
  guest_name: string | null
  price: number
  discount_percent: number
  used_reward: boolean
  total: number | null
  status: PassStatus
  source: PassSource
  checked_in_at: string | null
  product: { name: string; from_time: string; to_time: string } | null
  player: { display_name: string } | null
  payments: EntryPayment[]
}

export function toPass(row: PassRow, timezone: string): DayUsePass {
  const fromTime = row.product?.from_time ?? '00:00'
  const toTime = row.product?.to_time ?? '24:00'
  return {
    id: row.id,
    code: row.code,
    productId: row.product_id,
    productName: row.product?.name ?? 'Day use',
    date: row.on_date,
    startsAt: zonedTime(row.on_date, parseTime(fromTime), timezone),
    endsAt: zonedTime(row.on_date, parseTime(toTime), timezone),
    playerId: row.player_id,
    // A private profile is not readable by other members (RLS); staff always read it.
    holder: row.guest_name ?? row.player?.display_name ?? 'Jugador',
    isGuest: row.player_id === null,
    price: row.price,
    discountPercent: row.discount_percent,
    usedReward: row.used_reward,
    total: row.total ?? passTotal(row.price, row.discount_percent),
    status: row.status,
    source: row.source,
    checkedInAt: row.checked_in_at ? toDate(row.checked_in_at) : null,
    payments: row.payments,
  }
}

// Same rule as cancel_day_use for a player: before check-in, and until the pass hours end.
export function canCancelPass(pass: Pick<DayUsePass, 'status' | 'endsAt'>, now: Date): boolean {
  return pass.status === 'bought' && pass.endsAt > now
}

const PASS_CODE = /^DU-\d{6}$/

export function isPassCode(value: unknown): value is string {
  return typeof value === 'string' && PASS_CODE.test(value)
}

// Where the pass QR leads: the club panel, for reception.
export function passCheckInPath(code: string): string {
  return `/club/day-use/pase/${code}`
}

export type InsidePerson = { name: string; productName: string; checkedInAt: Date }

export function toInsidePerson(row: { name: string; product_name: string; checked_in_at: string }): InsidePerson {
  return { name: row.name, productName: row.product_name, checkedInAt: toDate(row.checked_in_at) }
}

export type DayUseOccupancy = { courtId: string; dayUseProductId: string | null; startsAt: Date }
export type UnblockedCourt = { productId: string; date: LocalDate; courtId: string }

// Court-days a pass should block and does not: the court was taken (or inactive) when it was
// generated. What already started is left out, like private.generate_day_use does.
export function unblockedCourts(
  product: DayUseProduct,
  dates: LocalDate[],
  overrides: DayUseOverride[],
  occupancies: DayUseOccupancy[],
  now: Date,
  timezone: string,
): UnblockedCourt[] {
  return dates.flatMap((date) => {
    if (!isOpenOn(product, date, overrides)) return []
    const { startsAt } = productPeriod(product, date, timezone)
    if (startsAt <= now) return []
    return product.courtIds
      .filter(
        (courtId) =>
          !occupancies.some(
            (item) => item.dayUseProductId === product.id && item.courtId === courtId && item.startsAt.getTime() === startsAt.getTime(),
          ),
      )
      .map((courtId) => ({ productId: product.id, date, courtId }))
  })
}

// The day use card in Inicio (lib/data/day-use.ts loadDayUseHome).
export type DayUseHome = {
  rule: LoyaltyRule
  loyalty: Loyalty
  todayPass: { id: string; text: string } | null
  todayText: string | null
}
