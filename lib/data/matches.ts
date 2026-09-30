import 'server-only'
import type { Club, MemberViewer } from '@/lib/auth/viewer'
import { availabilityKey } from '@/lib/domain/availability'
import { dayLabel } from '@/lib/domain/format'
import { freeCourtIds } from '@/lib/domain/match-risk'
import {
  matchFormDefaults,
  toMatch,
  type Match,
  type MatchFormOptions,
  type MatchLookups,
  type MatchRow,
  type MatchStatus,
  type Period,
  type PlayerContext,
} from '@/lib/domain/matches'
import { habitKey } from '@/lib/domain/matches-for-me'
import { daySlots } from '@/lib/domain/slots'
import { addDays, localDateOf, minutesOfDay, toDate, weekdayOf, type LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const MATCH_SELECT =
  'id, starts_at, ends_at, preferred_court_id, court_id, allow_other_court, category_min, category_max, match_type, status, cancel_reason, booking_id, booking:bookings!open_matches_booking_fkey(price), slots:match_slots(position, side, player_id, player:profiles(display_name))'

async function lookups(club: Club): Promise<MatchLookups> {
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name').eq('club_id', club.id),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  return {
    courtNames: new Map(courts.data.map((court) => [court.id, court.name])),
    rules: rules.data.map((rule) => ({ weekdays: rule.weekdays, fromTime: rule.from_time, toTime: rule.to_time, price: rule.price })),
    timezone: club.timezone,
  }
}

// Matches that start inside the range, read with the viewer's session (members read every match
// of their club; the booking price only comes back to its players and staff).
export async function loadMatches(
  club: Club,
  range: { from: Date; to: Date },
  statuses: MatchStatus[] = ['forming', 'confirmed'],
): Promise<Match[]> {
  const supabase = await createClient()
  const [names, matches] = await Promise.all([
    lookups(club),
    supabase
      .from('open_matches')
      .select(MATCH_SELECT)
      .eq('club_id', club.id)
      .in('status', statuses)
      .gte('starts_at', range.from.toISOString())
      .lt('starts_at', range.to.toISOString())
      .order('starts_at'),
  ])
  if (matches.error) throw matches.error
  return matches.data.map((row: MatchRow) => toMatch(row, names))
}

export async function loadMatch(club: Club, id: string): Promise<Match | null> {
  const supabase = await createClient()
  const [names, match] = await Promise.all([
    lookups(club),
    supabase.from('open_matches').select(MATCH_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle(),
  ])
  if (match.error) throw match.error
  return match.data ? toMatch(match.data, names) : null
}

// Where each match could still get a court: active courts with nothing overlapping its slot.
export async function loadFreeCourts(club: Club, matches: Match[]): Promise<Map<string, string[]>> {
  if (matches.length === 0) return new Map()
  const from = new Date(Math.min(...matches.map((match) => match.startsAt.getTime()))).toISOString()
  const to = new Date(Math.max(...matches.map((match) => match.endsAt.getTime()))).toISOString()
  const supabase = await createClient()
  const [courts, occupancies] = await Promise.all([
    supabase.from('courts').select('id').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
    supabase
      .from('court_occupancy')
      .select('court_id, starts_at, ends_at')
      .eq('club_id', club.id)
      .lt('starts_at', to)
      .gt('ends_at', from),
  ])
  if (courts.error) throw courts.error
  if (occupancies.error) throw occupancies.error
  const courtIds = courts.data.map((court) => court.id)
  const taken = occupancies.data.map((row) => ({ courtId: row.court_id, startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
  return new Map(matches.map((match) => [match.id, freeCourtIds(courtIds, taken, match)]))
}

// What the join rules, the cards and "Partidos para vos" need to know about the viewer: what he
// has booked or joined (busy), where and when he usually plays (habits, last 120 days).
export async function loadPlayerContext(viewer: MemberViewer, now = new Date()): Promise<PlayerContext> {
  const supabase = await createClient()
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString()
  const [bookings, spots, availability, preferred] = await Promise.all([
    supabase
      .from('bookings')
      .select('starts_at, ends_at')
      .eq('player_id', viewer.userId)
      .eq('status', 'confirmed')
      .gt('ends_at', since),
    supabase.from('match_slots').select('match:open_matches(starts_at, ends_at, status)').eq('player_id', viewer.userId),
    supabase.from('player_availability').select('weekday, band').eq('user_id', viewer.userId),
    supabase.from('player_preferred_courts').select('court_id').eq('user_id', viewer.userId),
  ])
  if (bookings.error) throw bookings.error
  if (spots.error) throw spots.error
  if (availability.error) throw availability.error
  if (preferred.error) throw preferred.error

  const timezone = viewer.club.timezone
  const booked: Period[] = bookings.data.map((row) => ({ startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
  const inMatches = spots.data.flatMap((row) =>
    row.match && row.match.status !== 'cancelled'
      ? [{ startsAt: toDate(row.match.starts_at), endsAt: toDate(row.match.ends_at), confirmed: row.match.status === 'confirmed' }]
      : [],
  )
  const playedAt = new Map<string, number>()
  for (const game of [...booked, ...inMatches.filter((match) => match.confirmed)]) {
    if (game.startsAt >= now) continue
    const key = habitKey(weekdayOf(localDateOf(game.startsAt, timezone)), minutesOfDay(game.startsAt, timezone))
    playedAt.set(key, (playedAt.get(key) ?? 0) + 1)
  }

  return {
    player: {
      id: viewer.userId,
      category: viewer.membership.category,
      gender: viewer.profile.gender,
      side: viewer.profile.side,
    },
    busy: [...booked, ...inMatches]
      .filter((period) => period.endsAt > now)
      .map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
    habits: {
      playedAt,
      availability: new Set(availability.data.map((row) => availabilityKey(row.weekday, row.band))),
      preferredCourtIds: new Set(preferred.data.map((row) => row.court_id)),
    },
  }
}

// Choices for the "Armar partido" sheet: the next seven days, the club's slots, its active courts.
export async function loadMatchFormOptions(viewer: MemberViewer, context: PlayerContext, today: LocalDate): Promise<MatchFormOptions> {
  const supabase = await createClient()
  const courts = await supabase
    .from('courts')
    .select('id, name')
    .eq('club_id', viewer.club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (courts.error) throw courts.error
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index))
  return {
    days: days.map((date) => ({ date, label: dayLabel(date, today) })),
    // Same schedule as scheduleOf in ./day, inlined: day.ts imports this module.
    times: daySlots(
      {
        timezone: viewer.club.timezone,
        opensAt: viewer.club.opens_at,
        closesAt: viewer.club.closes_at,
        slotMinutes: viewer.club.slot_minutes,
      },
      today,
    ).map((slot) => slot.label),
    courts: courts.data,
    defaults: matchFormDefaults(context.player),
  }
}
