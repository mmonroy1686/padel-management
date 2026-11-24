import 'server-only'
import { createClient } from '@/lib/supabase/server'

// The club's courts and price bands, for Ajustes → Canchas y precios and the setup assistant.
export async function loadCourtsAndPrices(clubId: string) {
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id, name, is_covered, is_active').eq('club_id', clubId).order('sort_order'),
    supabase.from('pricing_rules').select('id, weekdays, from_time, to_time, price').eq('club_id', clubId).order('from_time'),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  return { courts: courts.data, rules: rules.data }
}

// How far a club that is not set up got: what "Listo" and the Inicio notice need.
export async function loadSetupState(clubId: string): Promise<{ activeCourts: number; priceRules: number }> {
  const supabase = await createClient()
  const [courts, rules] = await Promise.all([
    supabase.from('courts').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('is_active', true),
    supabase.from('pricing_rules').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
  ])
  if (courts.error) throw courts.error
  if (rules.error) throw rules.error
  return { activeCourts: courts.count ?? 0, priceRules: rules.count ?? 0 }
}
