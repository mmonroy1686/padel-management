import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import type { PlayedBooking, ResultPlayer } from '@/lib/domain/booking-result'
import { americanoPodium, championshipPodiums, sortPodiums, type Podium } from '@/lib/domain/podiums'
import { createClient } from '@/lib/supabase/server'
import { loadFixture } from './championship-fixture'
import { loadChampionships } from './championships'
import { loadTournaments } from './tournaments'

// The viewer's played bookings in the club, newest first, with their players and result (my_played_bookings).
export async function loadPlayedBookings(club: Club, limit = 30): Promise<PlayedBooking[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_played_bookings', { p_club_id: club.id, p_limit: limit })
  if (error) throw error
  return (data ?? []).map((row) => ({
    bookingId: row.booking_id,
    startsAt: new Date(row.starts_at),
    courtName: row.court_name,
    players: (row.players as ResultPlayer[]) ?? [],
    result:
      row.team_a && row.games_a && row.games_b ? { teamA: row.team_a, gamesA: row.games_a, gamesB: row.games_b } : null,
  }))
}

// The showcase: the podiums of the viewer in the club's championships and finished americanos.
export async function loadMyPodiums(club: Club, profileId: string): Promise<Podium[]> {
  const [championships, tournaments] = await Promise.all([
    loadChampionships(club),
    loadTournaments(club, { endsAfter: new Date(0) }),
  ])
  const played = championships.filter(
    (championship) =>
      championship.status !== 'draft' &&
      championship.categories.some((category) =>
        category.entries.some((entry) => entry.player1.profileId === profileId || entry.player2.profileId === profileId),
      ),
  )
  const fixtures = await Promise.all(played.map((championship) => loadFixture(championship.id)))
  return sortPodiums([
    ...played.flatMap((championship, index) => championshipPodiums(championship, fixtures[index], profileId, club.timezone)),
    ...tournaments.flatMap((tournament) => americanoPodium(tournament, profileId, club.timezone) ?? []),
  ])
}
