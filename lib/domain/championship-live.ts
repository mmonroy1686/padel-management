import type { MatchSet } from './championship-fixture'
import { checkResult, type MatchRules, type Score } from './championship-results'

// Design: "Marcador en vivo": reception adds the games with "+1" and the database closes the sets
// (private.live_sets). This is what "Terminar partido" sends: the closed sets and, with a time limit, the one being
// played as it stands (if it has games); only once that is a result under the category's rules.

export type LiveFinish = { sets: Score[]; label: string }

export function liveFinish(sets: MatchSet[], rules: MatchRules): LiveFinish | null {
  const scores: Score[] = sets.filter((item) => !item.inProgress).map((item) => [item.a, item.b])
  const current = sets.find((item) => item.inProgress)
  if (rules.timeLimit !== null && current && current.a + current.b > 0) scores.push([current.a, current.b])
  if (scores.length === 0 || !checkResult(scores, rules).ok) return null
  return { sets: scores, label: `Terminar partido con ${scores.map(([a, b]) => `${a}-${b}`).join(' ')}` }
}
