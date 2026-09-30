import { DAY_BAND_WORDS, dayBandOf } from './availability'
import { SLOT_SIDE_WORDS, type Match } from './matches'
import { firstName } from './profile'
import { formatMinutes, localDateOf, minutesOfDay, weekdayOf } from './time'

export const WEEKDAYS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'] as const

// A row of match_suggestions (the columns this module reads).
export type SuggestionRow = {
  player_id: string
  display_name: string
  category: number
  spot: number
  exact_side: boolean
  times_played: number
  usually_free: boolean
  prefers_court: boolean
  score: number
}
export type Chip = { text: string; hit: boolean }
export type SuggestionView = { playerId: string; name: string; score: number; chips: Chip[] }

// Prototype: suggestions. "hit" marks the reasons that weigh the most.
export function toSuggestion(row: SuggestionRow, context: { match: Match; timezone: string }): SuggestionView {
  const { match, timezone } = context
  const minutes = minutesOfDay(match.startsAt, timezone)
  const days = WEEKDAYS_PLURAL[weekdayOf(localDateOf(match.startsAt, timezone))]
  const spotSide = match.slots.find((slot) => slot.position === row.spot)?.side ?? 'drive'
  const chips: Chip[] = [
    row.exact_side ? { text: `Juega de ${SLOT_SIDE_WORDS[spotSide]}`, hit: true } : { text: 'Juega en los dos lados', hit: false },
    { text: `${row.category}ª categoría`, hit: false },
  ]
  if (row.times_played > 0) {
    const times = row.times_played === 1 ? '1 vez' : `${row.times_played} veces`
    chips.push({ text: `Jugó ${times} los ${days} a las ${formatMinutes(minutes)}`, hit: row.times_played >= 3 })
  }
  if (row.usually_free) chips.push({ text: `Suele estar libre los ${days} ${DAY_BAND_WORDS[dayBandOf(minutes)]}`, hit: true })
  if (row.prefers_court) chips.push({ text: `Prefiere la ${match.preferredCourtName}`, hit: false })
  return { playerId: row.player_id, name: row.display_name, score: row.score, chips }
}

// The app has no phone numbers: WhatsApp opens with the message and the player picks the contact.
export function inviteText(name: string, share: string): string {
  return `Hola ${firstName(name)}! Te paso este partido, por si te sirve:\n\n${share}`
}
