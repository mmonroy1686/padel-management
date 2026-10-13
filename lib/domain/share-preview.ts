import { datesText, type Championship } from './championships'
import { WEEKDAYS_SHORT, timeIn } from './format'
import { missingText, SLOT_SIDES, type SlotSide } from './matches'
import { localDateOf, weekdayOf } from './time'

// What WhatsApp shows for a shared link: a title and a line under it.
export type SharePreview = { title: string; description: string }
export type MatchPreview = { startsAt: Date; openSides: SlotSide[] }

// What public.match_preview returns, or null.
export function readMatchPreview(data: unknown): MatchPreview | null {
  if (typeof data !== 'object' || data === null) return null
  const { starts_at: startsAt, open_sides: openSides } = data as Record<string, unknown>
  if (typeof startsAt !== 'string' || !Array.isArray(openSides)) return null
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) return null
  const sides = openSides.filter((side): side is SlotSide => (SLOT_SIDES as readonly unknown[]).includes(side))
  return sides.length === 0 ? null : { startsAt: date, openSides: sides }
}

// "Falta 1 de revés · jue 20:00": day, time and what is missing. Never names.
export function matchPreview(preview: MatchPreview, clubName: string, timezone: string): SharePreview {
  const slots = preview.openSides.map((side, index) => ({ position: index + 1, side, playerId: null, playerName: null }))
  const day = WEEKDAYS_SHORT[weekdayOf(localDateOf(preview.startsAt, timezone))]
  return {
    title: `${missingText({ slots })} · ${day} ${timeIn(preview.startsAt, timezone)}`,
    description: `Sumate al partido en ${clubName}.`,
  }
}

// Any page without a preview of its own: the club.
export function clubPreview(clubName: string): SharePreview {
  return { title: clubName, description: 'Reservá cancha y armá partido.' }
}

export function championshipPreview(championship: Pick<Championship, 'name' | 'windows'>): SharePreview {
  return { title: championship.name, description: datesText(championship) }
}
