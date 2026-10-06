import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { toChampionship, type Championship } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'
import { createClient } from '@/lib/supabase/server'

// FK hints: championship_entries points at players twice, and every embed goes through a composite FK.
// Players come without phone or email (column privileges): those come from championship_contacts.
const CHAMPIONSHIP_SELECT =
  'id, name, rules, poster_path, status, registration_opens_at, registration_closes_at, max_categories_per_player, windows:championship_windows!championship_windows_championship_in_club(id, on_date, from_time, to_time, court_ids), categories:championship_categories!championship_categories_championship_in_club(id, name, gender, level_min, level_max, min_pairs, max_pairs, price, format, group_size, qualifiers_per_group, match_minutes, seeding, match_rules, status, merged_into, sort_order, entries:championship_entries!championship_entries_category_in_club(id, player1_level, player2_level, status, note, unavailability_note, unavailability_approved, created_at, player1:players!championship_entries_player1_in_club(id, name, profile_id), player2:players!championship_entries_player2_in_club(id, name, profile_id), payments!payments_championship_entry_in_club(status, amount, rejection_reason, created_at), unavailability:entry_unavailability!entry_unavailability_entry_in_club(on_date, from_time)))'

// The club's championships, newest first, read with the viewer's session: members get the ones out of draft,
// staff every one (RLS). Payments and hours come back only to the pair and to staff.
export async function loadChampionships(club: Club): Promise<Championship[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('championships')
    .select(CHAMPIONSHIP_SELECT)
    .eq('club_id', club.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => toChampionship(row, club.timezone))
}

export async function loadChampionship(club: Club, id: string): Promise<Championship | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('championships')
    .select(CHAMPIONSHIP_SELECT)
    .eq('club_id', club.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toChampionship(data, club.timezone) : null
}

// To pick a partner: the other members with a public profile (public.member_directory).
export async function loadMemberDirectory(club: Club): Promise<MemberOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('member_directory', { p_club_id: club.id })
  if (error) throw error
  return data.map((row) => ({ userId: row.user_id, name: row.name }))
}

// Player id → phone, for what the viewer may see: every player for staff, her pairs' for a member.
export async function loadChampionshipPhones(championshipId: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('championship_contacts', { p_championship_id: championshipId })
  if (error) throw error
  return new Map(data.flatMap((row) => (row.phone ? [[row.player_id, row.phone] as const] : [])))
}
