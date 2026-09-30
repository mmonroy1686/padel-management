import {
  categoryRangeLabel,
  closesAt,
  isInMatch,
  MATCH_TYPE_LABELS,
  openSlots,
  overlaps,
  SLOT_SIDE_WORDS,
  type JoinContext,
  type Match,
  type MatchPlayer,
} from './matches'

export type JoinCheck = { ok: true } | { ok: false; reason: string }
export type JoinStatus = { ok: true; position: number; text: string } | { ok: false; text: string }

const no = (reason: string): JoinCheck => ({ ok: false, reason })

// Same rules and order as join_match: open, not in it, free spot, category, type, side, busy.
export function canJoin(match: Match, position: number, player: MatchPlayer, context: JoinContext): JoinCheck {
  if (match.status !== 'forming' || context.now >= closesAt(match, context.closeHours)) {
    return no('El partido ya no está abierto.')
  }
  if (isInMatch(match, player.id)) return no('Ya estás en este partido.')
  const slot = match.slots.find((candidate) => candidate.position === position)
  if (!slot || slot.playerId !== null) return no('Ese lugar ya está ocupado.')
  const range = categoryRangeLabel(match.categoryMin, match.categoryMax)
  if (player.category === null) return no(`Es para ${range} y todavía no tenés categoría.`)
  if (player.category < match.categoryMin || player.category > match.categoryMax) {
    return no(`Es para ${range} y vos sos ${player.category}ª.`)
  }
  if (match.type !== 'mixed' && player.gender !== match.type) {
    return no(`Es un partido ${MATCH_TYPE_LABELS[match.type].toLowerCase()}.`)
  }
  if (player.side !== 'both' && player.side !== slot.side) return no(`Este lugar es de ${SLOT_SIDE_WORDS[slot.side]}.`)
  if (context.busy.some((period) => overlaps(period, match))) return no('Ya tenés una reserva o un partido a esa hora.')
  return { ok: true }
}

// For cards: the first spot the player can take, or the reason he cannot.
export function joinStatus(match: Match, player: MatchPlayer, context: JoinContext): JoinStatus {
  if (isInMatch(match, player.id)) return { ok: false, text: 'Ya estás anotado.' }
  const checks = openSlots(match).map((slot) => ({ slot, check: canJoin(match, slot.position, player, context) }))
  const first = checks.find(({ check }) => check.ok)
  if (first) return { ok: true, position: first.slot.position, text: `Podés sumarte de ${SLOT_SIDE_WORDS[first.slot.side]}.` }
  for (const { check } of checks) if (!check.ok) return { ok: false, text: check.reason }
  return { ok: false, text: 'El partido ya no está abierto.' }
}
