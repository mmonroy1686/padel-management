import { parseTime, zonedTime, type LocalDate } from '../../../lib/domain/time'
import { adminClient, clubRow, signedInClient, type TestUser } from './admin'

// Creates, as the player and through create_match, a match on the club's first active court.
export async function createMatchAs(
  user: TestUser,
  input: {
    day: LocalDate
    time: string
    side: 'drive' | 'backhand'
    type?: 'male' | 'female' | 'mixed'
    categoryMin?: number
    categoryMax?: number
  },
): Promise<string> {
  const admin = adminClient()
  const club = await clubRow(admin)
  const { data: courts, error } = await admin
    .from('courts')
    .select('id')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  const client = await signedInClient(user)
  const created = await client.rpc('create_match', {
    p_court_id: courts[0].id,
    p_starts_at: zonedTime(input.day, parseTime(input.time), club.timezone).toISOString(),
    p_allow_other_court: true,
    p_category_min: input.categoryMin ?? 1,
    p_category_max: input.categoryMax ?? 8,
    p_match_type: input.type ?? 'mixed',
    p_side: input.side,
  })
  if (created.error) throw created.error
  return created.data.id
}

export async function joinMatchAs(user: TestUser, matchId: string, position: number): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('join_match', { p_match_id: matchId, p_position: position })
  if (error) throw error
}

// The simulated clock of the closing test: the match now starts in `minutes`, inside its closing window.
export async function moveMatchStart(matchId: string, minutes: number): Promise<void> {
  const start = new Date(Date.now() + minutes * 60_000)
  const end = new Date(start.getTime() + 90 * 60_000)
  const { error } = await adminClient()
    .from('open_matches')
    .update({ period: `[${start.toISOString()},${end.toISOString()})` })
    .eq('id', matchId)
  if (error) throw error
}
