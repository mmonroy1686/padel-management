// The aviso to a player about her partner in a fixed-pairs americano. The database writes it
// (private.notify_tournament_pair); the app shows it in /avisos and mails it with the same words.

export const TOURNAMENT_PAIR_KIND = 'tournament_pair' as const
export type TournamentPairKind = typeof TOURNAMENT_PAIR_KIND

export type TournamentPairEvent = 'added' | 'paired' | 'left'
export type TournamentPairData = { tournamentName: string; partnerName: string; event: TournamentPairEvent; startsAt: Date | null }

const EVENTS: readonly string[] = ['added', 'paired', 'left']

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function readTournamentPairData(data: unknown): TournamentPairData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const tournamentName = readText(record.tournament_name)
  const partnerName = readText(record.partner_name)
  const event = typeof record.event === 'string' && EVENTS.includes(record.event) ? (record.event as TournamentPairEvent) : null
  if (!tournamentName || !partnerName || !event) return null
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  return { tournamentName, partnerName, event, startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null }
}

export function tournamentPairText(data: TournamentPairData): { title: string; body: string } {
  switch (data.event) {
    case 'added':
      return {
        title: `${data.partnerName} te anotó como pareja en ${data.tournamentName}`,
        body: 'Juegan todo el americano juntos. Si no podés, date de baja desde el torneo.',
      }
    case 'paired':
      return {
        title: `Ya tenés pareja en ${data.tournamentName}: ${data.partnerName}`,
        body: 'El club los juntó. Juegan todo el americano juntos.',
      }
    case 'left':
      return {
        title: `${data.partnerName} se bajó de ${data.tournamentName}`,
        body: 'Seguís anotado, buscando pareja: el club te junta con alguien. Si preferís no jugar, date de baja desde el torneo.',
      }
  }
}
