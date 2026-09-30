import { isUuid, readEnum, readInt, readLocalDate, readText, readTime } from './input'
import { MATCH_TYPES, overlaps, type MatchType, type Period } from './matches'
import type { ParseResult } from './settings'
import { localDateOf, parseTime, zonedTime } from './time'
import { TOURNAMENT_SIZES, tournamentMinutes } from './tournaments'

export type TournamentInput = {
  name: string
  startsAt: string
  courtIds: string[]
  maxPlayers: number
  pointsPerGame: number
  roundMinutes: number
  rounds: number
  categoryMin: number
  categoryMax: number
  type: MatchType
  price: number
}

export type TakenPeriod = { courtId: string; startsAt: Date; endsAt: Date }

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as create_tournament, with a Spanish message for each. The date and time are on the
// club's clock; the instant goes to the database.
export function parseTournamentForm(form: FormData, timezone: string): ParseResult<TournamentInput> {
  const name = readText(form, 'name', { maxLength: 60 })
  if (!name) return fail('Poné un nombre de hasta 60 letras.')
  const date = readLocalDate(form, 'date')
  const time = readTime(form, 'time')
  if (!date || !time) return fail('Elegí el día y la hora.')

  const rawCourts = form.getAll('courtIds')
  const courtIds = [...new Set(rawCourts.filter(isUuid).map((id) => id.toLowerCase()))]
  if (courtIds.length === 0 || courtIds.length !== rawCourts.length) return fail('Elegí las canchas.')

  const maxPlayers = readInt(form, 'maxPlayers', { min: 8, max: 16 })
  if (maxPlayers === null || !(TOURNAMENT_SIZES as readonly number[]).includes(maxPlayers)) {
    return fail('El cupo es de 8, 12 o 16 jugadores.')
  }
  if (courtIds.length > maxPlayers / 4) return fail(`Con ${maxPlayers} jugadores se usan hasta ${maxPlayers / 4} canchas.`)

  const pointsPerGame = readInt(form, 'pointsPerGame', { min: 1, max: 99 })
  if (pointsPerGame === null) return fail('Los puntos por partido van de 1 a 99.')
  const roundMinutes = readInt(form, 'roundMinutes', { min: 5, max: 90 })
  if (roundMinutes === null) return fail('Los minutos por ronda van de 5 a 90.')
  const rounds = readInt(form, 'rounds', { min: 1, max: maxPlayers - 1 })
  if (rounds === null) return fail(`Con ${maxPlayers} jugadores se juegan de 1 a ${maxPlayers - 1} rondas.`)

  const categoryMin = readInt(form, 'categoryMin', { min: 1, max: 8 })
  const categoryMax = readInt(form, 'categoryMax', { min: 1, max: 8 })
  if (categoryMin === null || categoryMax === null || categoryMin > categoryMax) {
    return fail('La categoría "desde" tiene que ser menor o igual que "hasta".')
  }
  const type = readEnum(form, 'type', MATCH_TYPES)
  if (!type) return fail('Elegí el género.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')

  return {
    ok: true,
    value: {
      name,
      startsAt: zonedTime(date, parseTime(time), timezone).toISOString(),
      courtIds,
      maxPlayers,
      pointsPerGame,
      roundMinutes,
      rounds,
      categoryMin,
      categoryMax,
      type,
      price,
    },
  }
}

// From the start to the end its maximum size needs, like create_tournament.
export function tournamentPeriod(
  startsAt: Date,
  shape: { players: number; courts: number; rounds: number; roundMinutes: number },
): Period {
  return { startsAt, endsAt: new Date(startsAt.getTime() + tournamentMinutes(shape) * 60_000) }
}

// Same rule as create_tournament (outside_hours): starts after opening, ends before closing, same day.
export function fitsOpeningHours(period: Period, schedule: { timezone: string; opensAt: string; closesAt: string }): boolean {
  const date = localDateOf(period.startsAt, schedule.timezone)
  const opens = zonedTime(date, parseTime(schedule.opensAt), schedule.timezone)
  const closes = zonedTime(date, parseTime(schedule.closesAt), schedule.timezone)
  return period.startsAt >= opens && period.endsAt <= closes
}

// The chosen courts that already have something at that time (the database answers courts_busy).
export function busyCourtIds(taken: TakenPeriod[], courtIds: string[], period: Period): string[] {
  return courtIds.filter((id) => taken.some((item) => item.courtId === id && overlaps(item, period)))
}
