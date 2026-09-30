import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import {
  todayText,
  toInsidePerson,
  toOverride,
  toPass,
  toProduct,
  toSold,
  type DayUseHome,
  type DayUseOccupancy,
  type DayUseOverride,
  type DayUsePass,
  type DayUseProduct,
  type InsidePerson,
  type PassRow,
  type Sold,
} from '@/lib/domain/day-use'
import { timeIn } from '@/lib/domain/format'
import { loyaltyOf, loyaltyRuleOf, loyaltySince, type LoyaltyPass } from '@/lib/domain/loyalty'
import { localDateOf, toDate, type LocalDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

const PRODUCT_SELECT = 'id, name, price, includes, weekdays, from_time, to_time, capacity, court_ids, is_active, sort_order'
// FK hints: day_use_passes reaches profiles through four columns, and payments through its composite FK.
const PASS_SELECT =
  'id, code, product_id, on_date, player_id, guest_name, price, discount_percent, used_reward, total, status, source, checked_in_at, product:day_use_products!day_use_passes_product_in_club(name, from_time, to_time), player:profiles!day_use_passes_player_id_fkey(display_name), payments!payments_pass_in_club(status, amount, rejection_reason, created_at)'

type Viewer = { userId: string; club: Club }

// The passes the club offers, in its order. Inactive ones only for the configuration screen.
export async function loadProducts(club: Club, options: { includeInactive?: boolean } = {}): Promise<DayUseProduct[]> {
  const supabase = await createClient()
  let query = supabase.from('day_use_products').select(PRODUCT_SELECT).eq('club_id', club.id)
  if (!options.includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query.order('sort_order').order('name')
  if (error) throw error
  return data.map(toProduct)
}

export async function loadOverrides(club: Club, from: LocalDate, to: LocalDate): Promise<DayUseOverride[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('day_use_overrides')
    .select('product_id, on_date, enabled')
    .eq('club_id', club.id)
    .gte('on_date', from)
    .lte('on_date', to)
  if (error) throw error
  return data.map(toOverride)
}

// Totals per pass and day (day_use_sold): members read no other player's passes.
export async function loadSold(club: Club, from: LocalDate, to: LocalDate): Promise<Sold[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('day_use_sold', { p_club_id: club.id, p_from: from, p_to: to })
  if (error) throw error
  return data.map(toSold)
}

// "Ya están en el club": players get members who did not hide; staff get everyone.
export async function loadInside(club: Club, date: LocalDate): Promise<InsidePerson[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('day_use_inside', { p_club_id: club.id, p_date: date })
  if (error) throw error
  return data.map(toInsidePerson)
}

// The viewer's passes that were not cancelled, from `from` on (and up to `to`, if given).
export async function loadMyPasses(viewer: Viewer, from: LocalDate, to?: LocalDate): Promise<DayUsePass[]> {
  const supabase = await createClient()
  let query = supabase
    .from('day_use_passes')
    .select(PASS_SELECT)
    .eq('club_id', viewer.club.id)
    .eq('player_id', viewer.userId)
    .neq('status', 'cancelled')
    .gte('on_date', from)
  if (to) query = query.lte('on_date', to)
  const { data, error } = await query.order('on_date')
  if (error) throw error
  return data.map((row: PassRow) => toPass(row, viewer.club.timezone))
}

// One pass, read with the viewer's session: a player only finds her own, staff any of the club.
export async function loadPass(club: Club, id: string): Promise<DayUsePass | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('day_use_passes').select(PASS_SELECT).eq('club_id', club.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toPass(data, club.timezone) : null
}

// What the pass QR opens (staff only).
export async function loadPassByCode(club: Club, code: string): Promise<DayUsePass | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('day_use_passes').select(PASS_SELECT).eq('club_id', club.id).eq('code', code).maybeSingle()
  if (error) throw error
  return data ? toPass(data, club.timezone) : null
}

// Reception's "Hoy": every pass of that day that was not cancelled, in the order they were sold.
export async function loadPassesOn(club: Club, date: LocalDate): Promise<DayUsePass[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('day_use_passes')
    .select(PASS_SELECT)
    .eq('club_id', club.id)
    .eq('on_date', date)
    .neq('status', 'cancelled')
    .order('created_at')
  if (error) throw error
  return data.map((row: PassRow) => toPass(row, club.timezone))
}

// A member's passes for the stamps (lib/domain/loyalty.ts). Players read their own; staff anyone's.
export async function loadLoyaltyPasses(club: Club, playerId: string, since: LocalDate | null): Promise<LoyaltyPass[]> {
  const supabase = await createClient()
  let query = supabase.from('day_use_passes').select('on_date, status, used_reward, created_at').eq('club_id', club.id).eq('player_id', playerId)
  if (since) query = query.gte('on_date', since)
  const { data, error } = await query
  if (error) throw error
  return data.map((row) => ({
    date: row.on_date,
    boughtOn: localDateOf(toDate(row.created_at), club.timezone),
    status: row.status,
    usedReward: row.used_reward,
  }))
}

// Passes sold with a reward (not cancelled) since that date: reception's summary.
export async function loadRewardsUsed(club: Club, since: LocalDate): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('day_use_passes')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', club.id)
    .eq('used_reward', true)
    .neq('status', 'cancelled')
    .gte('on_date', since)
  if (error) throw error
  return count ?? 0
}

// The courts the passes hold between two instants, for the configuration warnings.
export async function loadDayUseOccupancies(club: Club, from: Date, to: Date): Promise<DayUseOccupancy[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('court_occupancy')
    .select('court_id, day_use_product_id, starts_at')
    .eq('club_id', club.id)
    .eq('kind', 'day_use')
    .gt('ends_at', from.toISOString())
    .lt('starts_at', to.toISOString())
  if (error) throw error
  return data.map((row) => ({ courtId: row.court_id, dayUseProductId: row.day_use_product_id, startsAt: toDate(row.starts_at) }))
}

// The day use card in Inicio; null while the club offers no pass.
export async function loadDayUseHome(viewer: Viewer, now = new Date()): Promise<DayUseHome | null> {
  const { club } = viewer
  const today = localDateOf(now, club.timezone)
  const rule = loyaltyRuleOf(club)
  const products = await loadProducts(club)
  if (products.length === 0) return null
  const [overrides, sold, mine, visits] = await Promise.all([
    loadOverrides(club, today, today),
    loadSold(club, today, today),
    loadMyPasses(viewer, today, today),
    loadLoyaltyPasses(club, viewer.userId, loyaltySince(rule, today)),
  ])
  const pass = mine[0] ?? null
  return {
    rule,
    loyalty: loyaltyOf(visits, rule, today),
    todayPass: pass
      ? { id: pass.id, text: `${pass.productName}, ${timeIn(pass.startsAt, club.timezone)} a ${timeIn(pass.endsAt, club.timezone)}` }
      : null,
    todayText: todayText(products, overrides, sold, today),
  }
}
