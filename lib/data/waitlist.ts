import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { priceFor } from '@/lib/domain/slots'
import { localDateOf, minutesOfDay, toDate, type LocalDate } from '@/lib/domain/time'
import {
  toWait,
  waitRangeText,
  type CourtName,
  type DayWait,
  type Hold,
  type Wait,
} from '@/lib/domain/waitlist'
import { toNotificationView, type NotificationView } from '@/lib/domain/notifications'
import { createClient } from '@/lib/supabase/server'

export type MyWaitlist = { waits: Wait[]; hold: Hold | null; courts: CourtName[] }

// The player's waiting waits, her active hold (with the slot's price, the same rule as
// private.slot_price) and the club's active courts to name them. RLS returns only hers.
export async function loadMyWaitlist(viewer: { userId: string; club: Club }, now = new Date()): Promise<MyWaitlist> {
  const { club } = viewer
  const supabase = await createClient()
  const [waits, holds, courts, rules] = await Promise.all([
    supabase
      .from('slot_waits')
      .select('id, on_date, from_time, to_time, court_ids')
      .eq('player_id', viewer.userId)
      .eq('status', 'waiting')
      .order('on_date')
      .order('from_time'),
    supabase
      .from('slot_holds')
      .select('id, starts_at, expires_at, court:courts(name)')
      .eq('player_id', viewer.userId)
      .eq('status', 'active')
      .gt('expires_at', now.toISOString())
      .limit(1),
    supabase.from('courts').select('id, name').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
    supabase.from('pricing_rules').select('weekdays, from_time, to_time, price').eq('club_id', club.id),
  ])
  if (waits.error) throw waits.error
  if (holds.error) throw holds.error
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error

  const row = holds.data[0]
  let hold: Hold | null = null
  if (row) {
    const startsAt = toDate(row.starts_at)
    const pricing = rules.data.map((rule) => ({
      weekdays: rule.weekdays,
      fromTime: rule.from_time,
      toTime: rule.to_time,
      price: rule.price,
    }))
    hold = {
      id: row.id,
      courtName: row.court?.name ?? 'Cancha',
      startsAt,
      expiresAt: toDate(row.expires_at),
      price: priceFor(pricing, localDateOf(startsAt, club.timezone), minutesOfDay(startsAt, club.timezone)),
    }
  }
  return { waits: waits.data.map(toWait), hold, courts: courts.data }
}

// The club's "En espera" panel: who waits on that date and for what, first in line first.
export async function loadDayWaits(club: Club, date: LocalDate): Promise<DayWait[]> {
  const supabase = await createClient()
  const [waits, courts] = await Promise.all([
    supabase
      .from('slot_waits')
      .select('id, on_date, from_time, to_time, court_ids, player:profiles!slot_waits_player_id_fkey(display_name)')
      .eq('club_id', club.id)
      .eq('on_date', date)
      .eq('status', 'waiting')
      .order('created_at'),
    supabase.from('courts').select('id, name').eq('club_id', club.id).eq('is_active', true).order('sort_order'),
  ])
  if (waits.error) throw waits.error
  if (courts.error) throw courts.error
  return waits.data.map((row) => ({
    id: row.id,
    playerName: row.player?.display_name ?? 'Sin nombre',
    text: waitRangeText(toWait(row), courts.data),
  }))
}

// The bell: avisos not read yet.
export async function countUnreadNotifications(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

// /avisos: the latest 50, newest first.
export async function loadNotifications(viewer: { userId: string; club: Club }): Promise<NotificationView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, data, link, created_at, read_at')
    .eq('user_id', viewer.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data.flatMap((row) => {
    const view = toNotificationView(row, viewer.club.timezone)
    return view ? [view] : []
  })
}
