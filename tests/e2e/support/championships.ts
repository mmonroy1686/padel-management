import { adminClient, signedInClient, type TestUser } from './admin'

export type Partner = { profileId: string } | { name: string; phone: string }

// Signs a pair up through register_championship_pair, with the player's own session; both declare 5ª.
export async function registerPairAs(user: TestUser, categoryId: string, partner: Partner): Promise<{ id: string; status: string }> {
  const client = await signedInClient(user)
  const { data, error } = await client.rpc('register_championship_pair', {
    p_category_id: categoryId,
    p_my_level: 5,
    p_partner_level: 5,
    ...('profileId' in partner
      ? { p_partner_profile_id: partner.profileId }
      : { p_partner_name: partner.name, p_partner_phone: partner.phone }),
  })
  if (error) throw error
  return { id: data.id, status: data.status }
}

// Withdraws a pair, as one of its players.
export async function withdrawAs(user: TestUser, entryId: string): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('withdraw_championship_entry', { p_entry_id: entryId })
  if (error) throw error
}

// A category of a championship, by its name (service role).
export async function categoryIdByName(championshipId: string, name: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('championship_categories')
    .select('id')
    .eq('championship_id', championshipId)
    .eq('name', name)
    .single()
  if (error) throw error
  return data.id
}

// A phone no earlier run used: 09 and seven digits from the clock (a phone is one player).
export function uniquePhone(): string {
  return `09${String(Date.now() + Math.floor(Math.random() * 100_000)).slice(-7)}`
}


export type FixtureRow = { id: string; stage: string; entryA: string | null; entryB: string | null }

// The matches of a championship (service role).
export async function fixtureMatches(championshipId: string): Promise<FixtureRow[]> {
  const { data, error } = await adminClient()
    .from('championship_matches')
    .select('id, stage, entry_a_id, entry_b_id')
    .eq('championship_id', championshipId)
  if (error) throw error
  return data.map((row) => ({ id: row.id, stage: row.stage, entryA: row.entry_a_id, entryB: row.entry_b_id }))
}

// Pair id → the number in its first player's name ("P3 Fixture" → 3), service role.
export async function pairNumbers(categoryId: string): Promise<Map<string, number>> {
  const { data, error } = await adminClient()
    .from('championship_entries')
    .select('id, player1:players!championship_entries_player1_in_club(name)')
    .eq('category_id', categoryId)
  if (error) throw error
  return new Map(data.map((row) => [row.id, Number(/^P([0-9]+)/.exec(row.player1?.name ?? '')?.[1] ?? 0)]))
}

// A result recorded by staff through record_match_result: side a or b wins 6-2 6-3.
export async function recordResultAs(user: TestUser, matchId: string, winner: 'a' | 'b'): Promise<void> {
  const client = await signedInClient(user)
  const sets = winner === 'a' ? [[6, 2], [6, 3]] : [[2, 6], [3, 6]]
  const { error } = await client.rpc('record_match_result', { p_match_id: matchId, p_sets: sets })
  if (error) throw error
}

// The public code publish_championship made (service role).
export async function publicCode(championshipId: string): Promise<string> {
  const { data, error } = await adminClient().from('championships').select('public_code').eq('id', championshipId).single()
  if (error) throw error
  if (!data.public_code) throw new Error('El campeonato no tiene código público')
  return data.public_code
}
