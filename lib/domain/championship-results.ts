import type { ThirdSet } from './championships'

// The result of a championship match (design: "Día del torneo"), with the same rules as private.match_winner: a
// set ends 6-0 to 6-4, 7-5 or 7-6 (tie-break at 6-6); the third set is a super tie-break to 10 by 2, or a full
// set. With a time limit the last set may stay as it was and the leader in sets, then in games, wins (a super
// tie-break counts as one game); a draw is no result.

export type MatchRules = { thirdSet: ThirdSet; timeLimit: number | null }
export type Score = [number, number]
export type ResultCheck = { ok: true; winner: 'a' | 'b' } | { ok: false; message: string }

export function setDone(a: number, b: number, superTiebreak: boolean): boolean {
  const high = Math.max(a, b)
  const low = Math.min(a, b)
  if (superTiebreak) return high >= 10 && high - low >= 2 && (high === 10 || high - low === 2)
  return (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6))
}

// A set the time cut: not over, and still possible.
export function setPartial(a: number, b: number, superTiebreak: boolean): boolean {
  if (setDone(a, b, superTiebreak)) return false
  return superTiebreak ? Math.max(a, b) < 10 || Math.abs(a - b) <= 1 : a <= 6 && b <= 6
}

export function checkResult(sets: Score[], rules: MatchRules): ResultCheck {
  if (sets.length === 0) return { ok: false, message: 'Cargá al menos un set.' }
  if (sets.length > 3) return { ok: false, message: 'Un partido tiene como mucho 3 sets.' }
  let wonA = 0
  let wonB = 0
  let gamesA = 0
  let gamesB = 0
  for (const [index, [a, b]] of sets.entries()) {
    if (![a, b].every((games) => Number.isInteger(games) && games >= 0 && games <= 99)) {
      return { ok: false, message: 'Los games son números de 0 a 99.' }
    }
    if (wonA === 2 || wonB === 2) return { ok: false, message: 'Sobra un set: el partido ya estaba ganado.' }
    const superTiebreak = index === 2 && rules.thirdSet === 'super_tiebreak'
    if (setDone(a, b, superTiebreak)) {
      if (a > b) {
        wonA++
      } else {
        wonB++
      }
    } else if (!(index === sets.length - 1 && rules.timeLimit !== null && setPartial(a, b, superTiebreak))) {
      return {
        ok: false,
        message: superTiebreak
          ? 'El súper tie-break termina a 10 con 2 de diferencia (10-8, 11-9…).'
          : `El set ${index + 1} no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.`,
      }
    }
    if (superTiebreak) {
      gamesA += a > b ? 1 : 0
      gamesB += b > a ? 1 : 0
    } else {
      gamesA += a
      gamesB += b
    }
  }
  if (rules.timeLimit === null && Math.max(wonA, wonB) < 2) {
    return { ok: false, message: 'Falta terminar el partido: alguien tiene que ganar 2 sets.' }
  }
  if (wonA !== wonB) return { ok: true, winner: wonA > wonB ? 'a' : 'b' }
  if (gamesA !== gamesB) return { ok: true, winner: gamesA > gamesB ? 'a' : 'b' }
  return { ok: false, message: 'Empate: con límite de tiempo gana quien va arriba en sets y después en games.' }
}

// How record_walkover stores a W.O.: 6-0 6-0 for the pair that showed up.
export function walkoverSets(winner: 'a' | 'b'): Score[] {
  return winner === 'a' ? [[6, 0], [6, 0]] : [[0, 6], [0, 6]]
}
