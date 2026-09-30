import { overlaps, type Match, type Period } from './matches'

export type Risk = { level: 'warn' | 'bad'; text: string }

// Active courts with nothing overlapping the period.
export function freeCourtIds(courtIds: string[], taken: (Period & { courtId: string })[], period: Period): string[] {
  return courtIds.filter((courtId) => !taken.some((item) => item.courtId === courtId && overlaps(item, period)))
}

// A forming match holds no court: someone may book its preferred one meanwhile.
export function riskOf(match: Match, free: string[]): Risk | null {
  if (match.status !== 'forming' || match.bookingId !== null) return null
  if (free.includes(match.preferredCourtId)) return null
  const name = match.preferredCourtName
  if (match.allowOtherCourt && free.length > 0) {
    const left = free.length === 1 ? 'queda 1' : `quedan ${free.length}`
    return { level: 'warn', text: `La ${name} ya se reservó. Si el partido se completa, se asigna otra cancha libre (${left}).` }
  }
  if (!match.allowOtherCourt && free.length > 0) {
    return {
      level: 'bad',
      text: `La ${name} ya se reservó y el partido no acepta otra cancha. Si nadie la libera, el partido se cae.`,
    }
  }
  return { level: 'bad', text: 'No quedan canchas libres a esa hora. Si nadie libera una, el partido se cae.' }
}
