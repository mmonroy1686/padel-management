import { signedInClient, type TestUser } from './admin'

// Signs the player up through join_tournament, with his own session.
export async function joinTournamentAs(user: TestUser, tournamentId: string): Promise<void> {
  const client = await signedInClient(user)
  const { error } = await client.rpc('join_tournament', { p_tournament_id: tournamentId })
  if (error) throw error
}

// Records every missing result as staff (team A 14, team B 10). Returns how many it recorded.
export async function recordMissingScoresAs(staff: TestUser, tournamentId: string, scoreA = 14): Promise<number> {
  const client = await signedInClient(staff)
  const { data, error } = await client
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .is('score_a', null)
  if (error) throw error
  for (const game of data) {
    const recorded = await client.rpc('record_tournament_score', { p_game_id: game.id, p_score_a: scoreA })
    if (recorded.error) throw recorded.error
  }
  return data.length
}
