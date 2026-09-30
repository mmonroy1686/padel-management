'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { timeIn } from '@/lib/domain/format'
import { isLocalDate } from '@/lib/domain/input'
import { MATCH_TYPE_LABELS, MATCH_TYPES } from '@/lib/domain/matches'
import { CATEGORIES } from '@/lib/domain/profile'
import { parseTime, zonedTime, type LocalDate } from '@/lib/domain/time'
import { busyCourtIds, fitsOpeningHours, tournamentPeriod, type TakenPeriod } from '@/lib/domain/tournament-form'
import { courtsText, TOURNAMENT_DEFAULTS, TOURNAMENT_SIZES } from '@/lib/domain/tournaments'

export type NewTournamentFormProps = {
  courts: { id: string; name: string }[]
  times: string[]
  today: LocalDate
  timezone: string
  opensAt: string
  closesAt: string
  taken: TakenPeriod[]
  action: FormAction
}

// Design: "Nuevo americano". Shows when it ends and which chosen courts are already taken before
// saving; create_tournament has the last word (courts_busy, outside_hours).
export function NewTournamentForm({ courts, times, today, timezone, opensAt, closesAt, taken, action }: NewTournamentFormProps) {
  const [date, setDate] = useState<string>(today)
  const [time, setTime] = useState(times.includes('18:00') ? '18:00' : (times[0] ?? '08:00'))
  const [maxPlayers, setMaxPlayers] = useState<number>(TOURNAMENT_DEFAULTS.maxPlayers)
  const [courtIds, setCourtIds] = useState(courts.slice(0, TOURNAMENT_DEFAULTS.maxPlayers / 4).map((court) => court.id))
  const [rounds, setRounds] = useState<number>(TOURNAMENT_DEFAULTS.rounds)
  const [roundMinutes, setRoundMinutes] = useState<number>(TOURNAMENT_DEFAULTS.roundMinutes)

  const period =
    isLocalDate(date) && courtIds.length > 0 && rounds > 0 && roundMinutes > 0
      ? tournamentPeriod(zonedTime(date, parseTime(time), timezone), { players: maxPlayers, courts: courtIds.length, rounds, roundMinutes })
      : null
  const busy = period ? busyCourtIds(taken, courtIds, period) : []
  const busyNames = courts.filter((court) => busy.includes(court.id)).map((court) => court.name)
  const toggleCourt = (courtId: string, checked: boolean) =>
    setCourtIds((current) =>
      checked
        ? courts.map((court) => court.id).filter((id) => id === courtId || current.includes(id))
        : current.filter((id) => id !== courtId),
    )

  return (
    <ActionForm action={action} submitLabel="Crear americano" pendingLabel="Creando…">
      <Field label="Nombre" htmlFor="name">
        <input id="name" name="name" required maxLength={60} placeholder="Americano de los jueves" className={inputClasses} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Fecha" htmlFor="date">
          <input id="date" name="date" type="date" min={today} required value={date} onChange={(event) => setDate(event.target.value)} className={inputClasses} />
        </Field>
        <Field label="Hora" htmlFor="time">
          <select id="time" name="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClasses}>
            {times.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jugadores" htmlFor="maxPlayers">
          <select
            id="maxPlayers"
            name="maxPlayers"
            value={maxPlayers}
            onChange={(event) => {
              const players = Number(event.target.value)
              setMaxPlayers(players)
              setRounds((current) => Math.min(current, players - 1))
            }}
            className={inputClasses}
          >
            {TOURNAMENT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} jugadores
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rondas" htmlFor="rounds">
          <input id="rounds" name="rounds" type="number" inputMode="numeric" min={1} max={maxPlayers - 1} required value={rounds}
            onChange={(event) => setRounds(Number(event.target.value))} className={inputClasses} />
        </Field>
        <Field label="Minutos por ronda" htmlFor="roundMinutes">
          <input id="roundMinutes" name="roundMinutes" type="number" inputMode="numeric" min={5} max={90} required value={roundMinutes}
            onChange={(event) => setRoundMinutes(Number(event.target.value))} className={inputClasses} />
        </Field>
        <Field label="Puntos por partido" htmlFor="pointsPerGame">
          <input id="pointsPerGame" name="pointsPerGame" type="number" inputMode="numeric" min={1} max={99} required
            defaultValue={TOURNAMENT_DEFAULTS.pointsPerGame} className={inputClasses} />
        </Field>
        <Field label="Categoría desde" htmlFor="categoryMin">
          <select id="categoryMin" name="categoryMin" defaultValue={1} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoría hasta" htmlFor="categoryMax">
          <select id="categoryMax" name="categoryMax" defaultValue={8} className={inputClasses}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}ª
              </option>
            ))}
          </select>
        </Field>
        <Field label="Género" htmlFor="type">
          <select id="type" name="type" defaultValue="mixed" className={inputClasses}>
            {MATCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {MATCH_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio por jugador" htmlFor="price">
          <input id="price" name="price" type="number" inputMode="numeric" min={0} required defaultValue={TOURNAMENT_DEFAULTS.price}
            className={inputClasses} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Canchas</legend>
        <div className="flex flex-wrap gap-4">
          {courts.map((court) => (
            <label key={court.id} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="courtIds"
                value={court.id}
                checked={courtIds.includes(court.id)}
                onChange={(event) => toggleCourt(court.id, event.target.checked)}
                className="size-5 accent-accent"
              />
              {court.name}
            </label>
          ))}
        </div>
        <p className="text-sm text-fg-muted">
          Con {maxPlayers} jugadores se usan hasta {maxPlayers / 4} canchas.
        </p>
      </fieldset>
      {period ? (
        <div role="note" className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">Termina a las {timeIn(period.endsAt, timezone)}</p>
          {!fitsOpeningHours(period, { timezone, opensAt, closesAt }) ? <p>Queda fuera del horario del club.</p> : null}
          {busyNames.length > 0 ? (
            <p>
              {courtsText(busyNames)} {busyNames.length === 1 ? 'ya tiene' : 'ya tienen'} algo a esa hora.
            </p>
          ) : null}
        </div>
      ) : null}
    </ActionForm>
  )
}
