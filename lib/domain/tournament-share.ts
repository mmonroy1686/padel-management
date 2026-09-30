import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS } from './matches'
import { courtsText, type Tournament } from './tournaments'

// The message players paste in the club's WhatsApp group; the link leads straight to the tournament.
export function tournamentShareText(input: {
  tournament: Tournament
  clubName: string
  dayText: string
  timeText: string
  url: string
}): string {
  const { tournament } = input
  const signedUp = tournament.entries.length
  const left = tournament.maxPlayers - signedUp
  const spots =
    left <= 0 ? 'Cupo completo' : `${left === 1 ? 'Queda 1 lugar' : `Quedan ${left} lugares`} (${signedUp} de ${tournament.maxPlayers})`
  const lines = [
    `🏆 ${tournament.name}`,
    `${input.dayText}, ${input.timeText}`,
    `${input.clubName}, ${courtsText(tournament.courtNames)}`,
    `Categoría ${categoryRangeLabel(tournament.categoryMin, tournament.categoryMax)}, ${MATCH_TYPE_LABELS[tournament.type].toLowerCase()}`,
    spots,
  ]
  if (tournament.price > 0) lines.push(`${formatPrice(tournament.price)} por persona`)
  return [...lines, '', `Anotate acá: ${input.url}`].join('\n')
}
