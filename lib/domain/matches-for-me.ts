import { availabilityKey, dayBandOf } from './availability'
import { joinStatus } from './match-join'
import type { Habits, JoinContext, Match, MatchPlayer } from './matches'
import { localDateOf, minutesOfDay, weekdayOf } from './time'

export type ForMe = { match: Match; reasons: string[] }

// Weekday (0 = Sunday) and start minute of a game, on the club's clock.
export function habitKey(weekday: number, minutes: number): string {
  return `${weekday}|${minutes}`
}

// Up to two matches the player can join and has a reason to: his usual time (3 or more games on that
// weekday and time), being usually free then, or his preferred court. Prototype: forMe.
export function matchesForMe(
  matches: Match[],
  player: MatchPlayer,
  context: JoinContext & { timezone: string; habits: Habits },
): ForMe[] {
  return matches
    .filter((match) => joinStatus(match, player, context).ok)
    .map((match) => {
      const minutes = minutesOfDay(match.startsAt, context.timezone)
      const weekday = weekdayOf(localDateOf(match.startsAt, context.timezone))
      const played = context.habits.playedAt.get(habitKey(weekday, minutes)) ?? 0
      const free = context.habits.availability.has(availabilityKey(weekday, dayBandOf(minutes)))
      const reasons: string[] = []
      let score = 0
      if (played >= 3) {
        score += 30
        reasons.push('Tu horario de siempre')
      } else if (free) {
        score += 18
        reasons.push('Estás libre a esa hora')
      }
      if (context.habits.preferredCourtIds.has(match.preferredCourtId)) {
        score += 10
        reasons.push('Tu cancha preferida')
      }
      return { match, reasons, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.match.startsAt.getTime() - b.match.startsAt.getTime())
    .slice(0, 2)
    .map(({ match, reasons }) => ({ match, reasons }))
}
