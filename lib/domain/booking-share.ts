// The message a booking's player sends by WhatsApp to fill it: when, where, how many are missing and the link that
// lets the others join (/turno/<id>). Without the count (a card that does not know the players), it just asks.
export function bookingShareText(input: {
  clubName: string
  dayText: string
  time: string
  courtName: string
  free: number | null
  url: string
}): string {
  const missing = input.free === null || input.free <= 0 ? null : input.free === 1 ? 'Falta 1' : `Faltan ${input.free}`
  return [
    `🎾 ${missing ? `${missing} para jugar pádel` : '¿Te sumás a jugar pádel?'}`,
    `${input.dayText} a las ${input.time}`,
    `${input.clubName}, ${input.courtName}`,
    '',
    `Sumate acá: ${input.url}`,
  ].join('\n')
}

export function bookingShareUrl(origin: string, bookingId: string): string {
  return `${origin}/turno/${bookingId}`
}
