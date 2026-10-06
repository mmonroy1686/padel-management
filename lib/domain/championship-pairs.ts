import {
  entryStateText,
  openCategories,
  pairName,
  spotsText,
  unavailabilityText,
  waitingPosition,
  type Championship,
  type ChampionshipEntry,
} from './championships'
import type { PaymentState } from './payments'
import { entryPaymentView } from './tournament-payments'

// A pair in the organizer's table. position: 0 with a place, its place in line when waiting.
export type PairRow = {
  entryId: string
  pair: string
  phones: string
  levels: string
  status: 'active' | 'waiting'
  position: number
  stateText: string
  paymentState: PaymentState
  due: number
  hoursText: string
  approved: boolean
  unavailable: string[]
  hoursNote: string | null
  note: string | null
}
export type PairsCategory = { id: string; name: string; spots: string; rows: PairRow[] }

type InEntry = ChampionshipEntry & { status: 'active' | 'waiting' }
const isIn = (entry: ChampionshipEntry): entry is InEntry => entry.status === 'active' || entry.status === 'waiting'

// Design: "por categoría, una tabla de parejas con estado de pago". Open categories only; pairs with a place or
// waiting. A waiting pair that paid nothing shows "Sin pagos": it pays once it gets in.
export function pairsCategories(championship: Championship, phones: Map<string, string>): PairsCategory[] {
  return openCategories(championship).map((category) => ({
    id: category.id,
    name: category.name,
    spots: spotsText(category),
    rows: category.entries.filter(isIn).map((entry) => {
      const payment = entryPaymentView(category.price, entry.payments, false)
      const paidSomething = entry.payments.some((item) => item.status === 'confirmed' || item.status === 'reported')
      return {
        entryId: entry.id,
        pair: pairName(entry),
        phones: [entry.player1, entry.player2].flatMap((player) => {
          const phone = phones.get(player.id)
          return phone ? [phone] : []
        }).join(' · '),
        levels: `${entry.level1}ª y ${entry.level2}ª`,
        status: entry.status,
        position: entry.status === 'waiting' ? (waitingPosition(category, entry.id) ?? 0) : 0,
        stateText: entryStateText(category, entry),
        paymentState: entry.status === 'waiting' && !paidSomething ? 'none' : payment.state,
        due: payment.due,
        hoursText: unavailabilityText(entry.unavailable.length),
        approved: entry.unavailabilityApproved,
        unavailable: entry.unavailable,
        hoursNote: entry.unavailabilityNote,
        note: entry.note,
      }
    }),
  }))
}
