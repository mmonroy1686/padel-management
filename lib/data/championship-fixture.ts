import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { loadChampionships } from '@/lib/data/championships'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { isDone, toFixture, type Fixture } from '@/lib/domain/championship-fixture'
import { readPublicChampionship, type PublicChampionship } from '@/lib/domain/championship-public'
import { matchViews, myMatchViews, type MyMatchItem } from '@/lib/domain/championship-views'
import { myEntries } from '@/lib/domain/championships'
import { localDateOf } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

// FK hints: every embed goes through a composite FK with club_id.
const GROUP_SELECT =
  'id, category_id, name, sort_order, members:championship_group_members!championship_group_members_group_in_club(entry_id, draw_position, place)'
const MATCH_SELECT =
  'id, category_id, stage, group_id, round, bracket_position, entry_a_id, entry_b_id, source_a, source_b, court_id, starts_at, ends_at, pinned, status, winner_entry_id, walkover_entry_id, sets:championship_match_sets!championship_match_sets_match_in_club(set_number, games_a, games_b, super_tiebreak, in_progress)'

// The groups and matches of a championship, read with the viewer's session: staff from the draw on, members once
// it is published (RLS).
export async function loadFixture(championshipId: string): Promise<Fixture> {
  const supabase = await createClient()
  const [groups, matches] = await Promise.all([
    supabase.from('championship_groups').select(GROUP_SELECT).eq('championship_id', championshipId),
    supabase.from('championship_matches').select(MATCH_SELECT).eq('championship_id', championshipId),
  ])
  if (groups.error) throw groups.error
  if (matches.error) throw matches.error
  return toFixture(groups.data, matches.data)
}

// The public page: anyone with the link, with or without a session.
export async function loadPublicChampionship(code: string): Promise<PublicChampionship | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_championship', { p_code: code })
  if (error) throw error
  return readPublicChampionship(data)
}

// Inicio's "Mis partidos": what the viewer's pairs still have to play in championships published or in progress.
export async function loadMyChampionshipMatches(club: Club, profileId: string, now: Date): Promise<MyMatchItem[]> {
  const championships = (await loadChampionships(club)).filter(
    (championship) =>
      (championship.status === 'published' || championship.status === 'in_progress') &&
      myEntries(championship, profileId).length > 0,
  )
  if (championships.length === 0) return []
  const [courts, fixtures] = await Promise.all([
    loadActiveCourts(club),
    Promise.all(championships.map((championship) => loadFixture(championship.id))),
  ])
  const ctx = {
    timezone: club.timezone,
    today: localDateOf(now, club.timezone),
    courtName: new Map(courts.map((court) => [court.id, court.name])),
  }
  return championships.flatMap((championship, index) =>
    myMatchViews(championship, matchViews(championship, fixtures[index], ctx), profileId)
      .filter((match) => !isDone(match))
      .map((match) => ({ ...match, href: `/campeonatos/${championship.id}`, championshipName: championship.name })),
  )
}
