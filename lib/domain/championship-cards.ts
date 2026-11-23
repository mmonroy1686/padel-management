import { roundName } from './championship-fixture'
import type { MatchView } from './championship-views'

// The public championship page: matches as cards grouped by phase, each pair with its initials, each match shareable.

// "Ana Pérez y Pedro Gómez" → "AP": the first letter of each player.
export function pairInitials(name: string): string {
  return name
    .split(' y ')
    .map((player) => player.trim().charAt(0).toLocaleUpperCase('es'))
    .join('')
    .slice(0, 2)
}

// Pastel backgrounds with dark ink; a pair keeps its tone wherever it shows.
export const AVATAR_TONES = [
  'bg-accent/20 text-fg',
  'bg-court/20 text-fg',
  'bg-court-blue/20 text-fg',
  'bg-danger/15 text-fg',
  'bg-rustic-amber/25 text-fg',
  'bg-fg-muted/20 text-fg',
] as const

export function avatarTone(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

export type PhaseGroup = { key: string; title: string; matches: MatchView[] }

const startOf = (match: MatchView) => match.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER

// Zones first (by name), then the knockout from its first round to the final; by start, then position, inside.
export function phaseGroups(views: MatchView[]): PhaseGroup[] {
  const groups = new Map<string, PhaseGroup & { order: [number, string] }>()
  for (const match of views) {
    const knockout = match.stage === 'knockout'
    const round = match.round ?? 1
    const key = knockout ? `k${round}` : `g-${match.name}`
    const group = groups.get(key) ?? {
      key,
      title: knockout ? roundName(round) : match.name,
      // Zones before the knockout; a bigger round (cuartos = 4) comes before a smaller one (final = 1).
      order: knockout ? [1, String(1000 - round).padStart(4, '0')] : [0, match.name],
      matches: [],
    }
    group.matches.push(match)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1].localeCompare(b.order[1], 'es'))
    .map(({ key, title, matches }) => ({
      key,
      title,
      matches: matches.sort((a, b) => startOf(a) - startOf(b) || (a.position ?? 0) - (b.position ?? 0)),
    }))
}

// What the card's share button sends: the result once played, when and where before.
export function matchShareText(match: MatchView, where: { championshipName: string; url: string }): string {
  const tail = `${match.name} · ${where.championshipName}\n${where.url}`
  if (match.winner) {
    const [winner, loser] = match.winner === 'a' ? [match.sideA, match.sideB] : [match.sideB, match.sideA]
    if (match.status === 'walkover') return `${winner} ganaron por W.O. a ${loser} · ${tail}`
    const sets = match.sets.map((set) => (match.winner === 'a' ? `${set.a}-${set.b}` : `${set.b}-${set.a}`)).join(' ')
    return `${winner} ganaron ${sets} a ${loser} · ${tail}`
  }
  const when = [match.day && match.time ? `${match.day} ${match.time}` : null, match.court].filter(Boolean).join(' · ')
  return `${match.sideA} vs ${match.sideB}${when ? ` · ${when}` : ''} · ${tail}`
}
