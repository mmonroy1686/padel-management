import { formatPrice } from './format'
import { categoryRangeLabel, MATCH_TYPE_LABELS, openSlots, perPlayerPrice, SLOT_SIDE_WORDS, type Match } from './matches'

// The message players paste in the club's WhatsApp group (prototype: shareText).
export function shareText(input: { match: Match; clubName: string; dayText: string; time: string; url: string }): string {
  const { match } = input
  const open = openSlots(match)
  const lines = [
    `🎾 ${open.length === 1 ? 'Falta 1' : `Faltan ${open.length}`} para el ${input.dayText} a las ${input.time}`,
    `${input.clubName}, ${match.courtName ?? match.preferredCourtName}`,
    `Categoría ${categoryRangeLabel(match.categoryMin, match.categoryMax)}, ${MATCH_TYPE_LABELS[match.type].toLowerCase()}`,
    `Falta: ${open.map((slot) => SLOT_SIDE_WORDS[slot.side]).join(', ')}`,
  ]
  if (match.price !== null) lines.push(`${formatPrice(perPlayerPrice(match.price))} por persona`)
  return [...lines, '', `Sumate acá: ${input.url}`].join('\n')
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
