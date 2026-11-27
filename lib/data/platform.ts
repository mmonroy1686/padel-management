import 'server-only'
import type { PlatformClub } from '@/lib/domain/platform'
import type { ClubWeek } from '@/lib/domain/platform-trial'
import { createClient } from '@/lib/supabase/server'

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) throw error
  return data === true
}

const at = (value: string | null) => (value ? new Date(value) : null)

// /plataforma: every club, newest first, with its trial and milestones (platform_clubs, platform admins only).
export async function loadPlatformClubs(): Promise<PlatformClub[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_clubs')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone,
    createdAt: new Date(row.created_at),
    setupCompletedAt: at(row.setup_completed_at),
    activeCourts: row.active_courts,
    staff: row.staff,
    adminInvitationExpiresAt: at(row.admin_invitation_expires_at),
    bookingsLastWeek: row.bookings_last_week,
    onlineLastWeek: row.online_last_week,
    lastBookingAt: at(row.last_booking_at),
    players: row.players,
    status: row.status,
    trialEndsOn: row.trial_ends_on,
    isSupport: row.is_support,
    milestones: {
      courtsAndPrices: at(row.courts_and_prices_at),
      receptionJoined: at(row.reception_joined_at),
      firstReceptionBooking: at(row.first_reception_booking_at),
      firstOnlineBooking: at(row.first_online_booking_at),
      twentiethPlayer: at(row.twentieth_player_at),
      firstPayment: at(row.first_payment_at),
      firstMatch: at(row.first_match_at),
      firstTournament: at(row.first_tournament_at),
      firstDayUse: at(row.first_day_use_at),
    },
  }))
}

// The club's page: its last weeks, oldest first.
export async function loadClubWeeks(clubId: string, weeks = 8): Promise<ClubWeek[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_club_weeks', { p_club_id: clubId, p_weeks: weeks })
  if (error) throw error
  return (data ?? []).map((row) => ({
    week: row.week,
    bookingsOnline: row.bookings_online,
    bookingsReception: row.bookings_reception,
    cancelled: row.cancelled,
    cancelledLate: row.cancelled_late,
    openHours: Number(row.open_hours),
    busyHours: Number(row.busy_hours),
    activePlayers: row.active_players,
    newPlayers: row.new_players,
    recovered: row.recovered,
    payments: row.payments,
    amount: Number(row.amount),
    played: row.played,
    noShows: row.no_shows,
  }))
}

export type ClubAccount = { ownerName: string; ownerPhone: string; ownerEmail: string; notes: string; updatedAt: Date }

export async function loadClubAccount(clubId: string): Promise<ClubAccount> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_club_account', { p_club_id: clubId })
  if (error) throw error
  return {
    ownerName: data.owner_name,
    ownerPhone: data.owner_phone,
    ownerEmail: data.owner_email,
    notes: data.notes,
    updatedAt: new Date(data.updated_at),
  }
}
