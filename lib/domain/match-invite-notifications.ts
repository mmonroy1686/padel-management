import { capitalize, shortDate, timeIn, WEEKDAYS_LONG } from './format'
import { categorySlashLabel, MATCH_TYPE_LABELS, MATCH_TYPES, type MatchType } from './matches'
import { localDateOf, weekdayOf } from './time'

// "Te invitan a un partido": public.invite_to_match writes it; the app shows it in /avisos and mails it with the
// same words.
export const MATCH_INVITE_KIND = 'match_invite' as const
export type MatchInviteKind = typeof MATCH_INVITE_KIND

export type MatchInviteData = {
  courtName: string
  startsAt: Date
  categoryMin: number
  categoryMax: number
  type: MatchType
}

function isMatchType(value: unknown): value is MatchType {
  return typeof value === 'string' && (MATCH_TYPES as readonly string[]).includes(value)
}

function readCategory(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8 ? value : null
}

// The jsonb invite_to_match writes; anything else reads as null.
export function readMatchInviteData(data: unknown): MatchInviteData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  const categoryMin = readCategory(record.category_min)
  const categoryMax = readCategory(record.category_max)
  if (typeof record.court_name !== 'string' || record.court_name.trim() === '') return null
  if (!startsAt || Number.isNaN(startsAt.getTime()) || categoryMin === null || categoryMax === null) return null
  if (!isMatchType(record.match_type)) return null
  return { courtName: record.court_name, startsAt, categoryMin, categoryMax, type: record.match_type }
}

// "Martes 24/11 19:00 · Cancha 2 · 5ª/6ª mixto": the aviso's body and the WhatsApp invitation's first line.
export function matchLine(data: MatchInviteData, timezone: string): string {
  const date = localDateOf(data.startsAt, timezone)
  return [
    `${capitalize(WEEKDAYS_LONG[weekdayOf(date)])} ${shortDate(date)} ${timeIn(data.startsAt, timezone)}`,
    data.courtName,
    `${categorySlashLabel(data.categoryMin, data.categoryMax)} ${MATCH_TYPE_LABELS[data.type].toLowerCase()}`,
  ].join(' · ')
}

export function matchInviteText(data: MatchInviteData, timezone: string): { title: string; body: string } {
  return { title: 'Te invitan a un partido', body: matchLine(data, timezone) }
}
