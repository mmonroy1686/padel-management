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
