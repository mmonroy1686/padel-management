import { dayLabel } from './format'
import type { LocalDate } from './time'

// The first day with room after a full one: its date, its earliest free slot and how many are free.
export type NextFree = { date: LocalDate; time: string; courtName: string; free: number }

// What the big "Reservar cancha" says under its title: today's free slots, or, with today full, the next one.
export function freeTodayText(free: number, next: NextFree | null, today: LocalDate): string {
  if (free > 0) return free === 1 ? '1 turno libre hoy' : `${free} turnos libres hoy`
  if (!next) return 'No quedan turnos esta semana'
  return `Hoy está lleno. Próximo libre: ${dayLabel(next.date, today).toLowerCase()} ${next.time}, ${next.courtName}`
}

// The way out of a full day on Reservar: "Ver mañana (6 libres)".
export function nextFreeLabel(next: NextFree, today: LocalDate): string {
  return `Ver ${dayLabel(next.date, today).toLowerCase()} (${next.free === 1 ? '1 libre' : `${next.free} libres`})`
}
