import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import type { TakenPeriod } from '@/lib/domain/tournament-form'
import { toTournament, type Tournament, type TournamentRow } from '@/lib/domain/tournaments'
import { toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

// FK hints: tournament_games also points at tournament_entries, and profiles is reached through
// three columns of tournament_entries.
const TOURNAMENT_SELECT =
  'id, name, starts_at, ends_at, court_ids, max_players, points_per_game, round_minutes, rounds, category_min, category_max, match_type, price, status, entries:tournament_entries!tournament_entries_tournament_in_club(id, player_id, guest_name, removed_at, created_at, player:profiles!tournament_entries_player_id_fkey(display_name), payments!payments_entry_in_club(status, amount, rejection_reason, created_at)), games:tournament_games!tournament_games_tournament_in_club(id, round, wave, court_id, starts_at, a1_entry_id, a2_entry_id, b1_entry_id, b2_entry_id, score_a)'

async function courtNames(club: Club): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courts').select('id, name').eq('club_id', club.id)
  if (error) throw error
  return new Map(data.map((court) => [court.id, court.name]))
}

// Tournaments of the club that end after the given instant, cancelled ones left out, read with the
// viewer's session: members read every tournament, entry and game of their club; payments come back
// only to their payer and to staff.
export async function loadTournaments(club: Club, range: { endsAfter: Date }): Promise<Tournament[]> {
  const supabase = await createClient()
  const [names, rows] = await Promise.all([
    courtNames(club),
    supabase
      .from('tournaments')
      .select(TOURNAMENT_SELECT)
      .eq('club_id', club.id)
      .neq('status', 'cancelled')
      .gt('ends_at', range.endsAfter.toISOString())
      .order('starts_at'),
  ])
  if (rows.error) throw rows.error
  return rows.data.map((row: TournamentRow) => toTournament(row, names))
}

export async function loadTournament(club: Club, id: string): Promise<Tournament | null> {
  const supabase = await createClient()
  const [names, row] = await Promise.all([
    courtNames(club),
    supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle(),
  ])
  if (row.error) throw row.error
  return row.data ? toTournament(row.data, names) : null
}

export async function loadActiveCourts(club: Club): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data
}

// Everything that takes a court in the next `days`, so "Nuevo americano" warns before saving.
export async function loadTakenPeriods(club: Club, from: Date, days: number): Promise<TakenPeriod[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('court_occupancy')
    .select('court_id, starts_at, ends_at')
    .eq('club_id', club.id)
    .gt('ends_at', from.toISOString())
    .lt('starts_at', new Date(from.getTime() + days * 86_400_000).toISOString())
  if (error) throw error
  return data.map((row) => ({ courtId: row.court_id, startsAt: toDate(row.starts_at), endsAt: toDate(row.ends_at) }))
}
