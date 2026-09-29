export type CancellationStatus = { allowed: true } | { allowed: false; reason: string }

// Same rule as cancel_my_booking: at least noticeHours before the start.
export function cancellationStatus(startsAt: Date, noticeHours: number, now: Date): CancellationStatus {
  const left = startsAt.getTime() - now.getTime()
  if (left <= 0) return { allowed: false, reason: 'Este turno ya empezó.' }
  if (left < noticeHours * 3_600_000) {
    return { allowed: false, reason: `Ya no se puede cancelar: faltan menos de ${noticeHours} h. Avisá al club.` }
  }
  return { allowed: true }
}

export function cancellationRule(noticeHours: number): string {
  if (noticeHours === 0) return 'Podés cancelar desde la app hasta que empiece el turno.'
  return `Podés cancelar desde la app hasta ${noticeHours} h antes. Después, avisá al club.`
}
