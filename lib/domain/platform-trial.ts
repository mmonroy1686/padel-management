import { errorMessage } from './errors'
import { readUuid } from './input'
import type { AccountStatus, PlatformClub } from './platform'
import type { ParseResult } from './settings'
import { parseLocalDate, type LocalDate } from './time'

// The platform follows each club through its trial: its status, the days left, the milestones of a trial that works
// and its weeks (design: docs/features/plataforma-trial/design.md).

export const ACCOUNT_STATUSES: { id: AccountStatus; label: string }[] = [
  { id: 'trial', label: 'Prueba' },
  { id: 'active', label: 'Activo' },
  { id: 'paused', label: 'Pausado' },
  { id: 'churned', label: 'Baja' },
]

export function accountStatusLabel(status: AccountStatus): string {
  return ACCOUNT_STATUSES.find((item) => item.id === status)?.label ?? status
}

export const TRIAL_DAYS = 60
export const PLAYERS_TARGET = 20
export const ONLINE_TARGET = 30

function daysFrom(from: LocalDate, to: LocalDate): number {
  const utc = (date: LocalDate) => {
    const { year, month, day } = parseLocalDate(date)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export type TrialTone = 'calm' | 'soon' | 'over' | 'none'

// "Prueba · quedan 12 días", "Prueba · vence hoy", "Prueba · venció hace 3 días"; any other status is its label.
// Nothing happens on its own when it ends: the tone only tells Miguel what to look at.
export function trialState(club: Pick<PlatformClub, 'status' | 'trialEndsOn'>, today: LocalDate): { text: string; tone: TrialTone; daysLeft: number | null } {
  if (club.status !== 'trial') return { text: accountStatusLabel(club.status), tone: 'none', daysLeft: null }
  const left = daysFrom(today, club.trialEndsOn)
  const when =
    left > 1
      ? `quedan ${left} días`
      : left === 1
        ? 'queda 1 día'
        : left === 0
          ? 'vence hoy'
          : left === -1
            ? 'venció ayer'
            : `venció hace ${-left} días`
  return { text: `Prueba · ${when}`, tone: left < 0 ? 'over' : left <= 7 ? 'soon' : 'calm', daysLeft: left }
}

export function onlineShare(club: Pick<PlatformClub, 'bookingsLastWeek' | 'onlineLastWeek'>): number | null {
  return club.bookingsLastWeek > 0 ? Math.round((100 * club.onlineLastWeek) / club.bookingsLastWeek) : null
}

export type Milestone = {
  key: string
  label: string
  done: boolean
  // When it was reached, when the milestone has a date.
  at: Date | null
  // How far it is, for the ones that count something: "12 de 20".
  progress: string | null
}
export type MilestoneGroup = { title: string; milestones: Milestone[] }

function dated(key: string, label: string, at: Date | null): Milestone {
  return { key, label, done: at !== null, at, progress: null }
}

// The milestones of a trial that works, in the order a club usually reaches them.
export function milestoneGroups(club: PlatformClub): MilestoneGroup[] {
  const m = club.milestones
  const share = onlineShare(club)
  return [
    {
      title: 'Setup',
      milestones: [
        dated('courts', 'Canchas y precios', m.courtsAndPrices),
        dated('setup', 'Alta terminada', club.setupCompletedAt),
        dated('reception', 'Recepción entró', m.receptionJoined),
      ],
    },
    {
      title: 'Primeras reservas',
      milestones: [
        dated('reception-booking', 'Primera reserva de recepción', m.firstReceptionBooking),
        dated('online-booking', 'Primera reserva online', m.firstOnlineBooking),
      ],
    },
    {
      title: 'Masa crítica',
      milestones: [
        {
          key: 'players',
          label: `${PLAYERS_TARGET} jugadores`,
          done: m.twentiethPlayer !== null,
          at: m.twentiethPlayer,
          progress: m.twentiethPlayer ? null : `${Math.min(club.players, PLAYERS_TARGET - 1)} de ${PLAYERS_TARGET}`,
        },
        {
          key: 'online-share',
          label: `${ONLINE_TARGET}% online en 7 días`,
          done: share !== null && share >= ONLINE_TARGET,
          at: null,
          progress: share === null ? 'Sin reservas en 7 días' : `${share}%`,
        },
      ],
    },
    {
      title: 'Módulos',
      milestones: [
        dated('payment', 'Primer cobro', m.firstPayment),
        dated('match', 'Primer partido abierto', m.firstMatch),
        dated('tournament', 'Primer torneo o campeonato', m.firstTournament),
        dated('day-use', 'Primer day use', m.firstDayUse),
      ],
    },
  ]
}

// How many it reached, and the first one still missing: what to push the club on next.
export function activation(club: PlatformClub): { done: number; total: number; next: Milestone | null } {
  const all = milestoneGroups(club).flatMap((group) => group.milestones)
  return { done: all.filter((item) => item.done).length, total: all.length, next: all.find((item) => !item.done) ?? null }
}

export type ClubWeek = {
  week: LocalDate
  bookingsOnline: number
  bookingsReception: number
  cancelled: number
  cancelledLate: number
  openHours: number
  busyHours: number
  activePlayers: number
  newPlayers: number
  recovered: number
  payments: number
  amount: number
  played: number
  noShows: number
}

export function weekBookings(week: ClubWeek): number {
  return week.bookingsOnline + week.bookingsReception
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((100 * part) / whole) : null
}

export function weekOccupancy(week: ClubWeek): number | null {
  return percent(week.busyHours, week.openHours)
}

export function weekOnlineShare(week: ClubWeek): number | null {
  return percent(week.bookingsOnline, weekBookings(week))
}

// "Estado": the status and the last day of the trial.
export function parseAccountStatusForm(
  form: FormData,
): ParseResult<{ clubId: string; status: AccountStatus; trialEndsOn: LocalDate | null }> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return { ok: false, message: errorMessage('invalid_input') }
  const status = form.get('status')
  const known = ACCOUNT_STATUSES.find((item) => item.id === status)
  if (!known) return { ok: false, message: errorMessage('invalid_status') }
  const raw = form.get('trialEndsOn')
  const trialEndsOn = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
  if (trialEndsOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(trialEndsOn)) {
    return { ok: false, message: 'Elegí la fecha de fin de la prueba.' }
  }
  return { ok: true, value: { clubId, status: known.id, trialEndsOn } }
}

export type AccountContact = { clubId: string; ownerName: string; ownerPhone: string; ownerEmail: string; notes: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function parseAccountContactForm(form: FormData): ParseResult<AccountContact> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return { ok: false, message: errorMessage('invalid_input') }
  const read = (field: string) => {
    const value = form.get(field)
    return typeof value === 'string' ? value.trim() : ''
  }
  const ownerName = read('ownerName')
  const ownerPhone = read('ownerPhone')
  const ownerEmail = read('ownerEmail').toLowerCase()
  const notes = read('notes')
  if (ownerName.length > 80) return { ok: false, message: 'El nombre es muy largo.' }
  if (ownerPhone.length > 40) return { ok: false, message: 'El teléfono es muy largo.' }
  if (ownerEmail && (ownerEmail.length > 254 || !EMAIL.test(ownerEmail))) return { ok: false, message: errorMessage('invalid_email') }
  if (notes.length > 4000) return { ok: false, message: 'Las notas son muy largas (hasta 4000 letras).' }
  return { ok: true, value: { clubId, ownerName, ownerPhone, ownerEmail, notes } }
}

const STATUS_ORDER: Record<AccountStatus, number> = { trial: 0, active: 1, paused: 2, churned: 3 }

// The list puts first what needs Miguel: trials by the days they have left (over ones on top), then active, paused
// and churned clubs.
export function byAttention(clubs: PlatformClub[], today: LocalDate): PlatformClub[] {
  const left = (club: PlatformClub) => (club.status === 'trial' ? daysFrom(today, club.trialEndsOn) : 0)
  return [...clubs].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || left(a) - left(b) || a.name.localeCompare(b.name, 'es'),
  )
}

// The line on top of the list: "4 clubes · 2 en prueba · 1 vence esta semana · 1 venció".
export function overviewText(clubs: PlatformClub[], today: LocalDate): string {
  const trials = clubs.filter((club) => club.status === 'trial')
  const days = trials.map((club) => daysFrom(today, club.trialEndsOn))
  const soon = days.filter((day) => day >= 0 && day <= 7).length
  const over = days.filter((day) => day < 0).length
  const active = clubs.filter((club) => club.status === 'active').length
  return [
    clubs.length === 1 ? '1 club' : `${clubs.length} clubes`,
    `${trials.length} en prueba`,
    active > 0 ? `${active} ${active === 1 ? 'activo' : 'activos'}` : null,
    soon > 0 ? `${soon} ${soon === 1 ? 'vence' : 'vencen'} en 7 días` : null,
    over > 0 ? `${over} ${over === 1 ? 'venció' : 'vencieron'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
