import { errorMessage } from './errors'
import { readUuid } from './input'
import type { ParseResult } from './settings'

// The platform (/plataforma): the clubs and how far each one got, and the form that creates one.

type Env = Record<string, string | undefined>

// The host /plataforma opens on (PLATFORM_HOST: the Vercel URL today, the root domain later, localhost:3000 locally).
// Anywhere else, and without the variable, it is a 404: it never shows on a club's subdomain.
export function isPlatformHost(rawHost: string | null, env: Env = process.env): boolean {
  const platform = env.PLATFORM_HOST?.trim().toLowerCase()
  const host = rawHost?.trim().toLowerCase()
  if (!platform || !host) return false
  return host === platform || (!/:\d+$/.test(platform) && host.replace(/:\d+$/, '') === platform)
}

export const TIMEZONES = [
  { id: 'America/Montevideo', label: 'Montevideo' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { id: 'America/Asuncion', label: 'Asunción' },
  { id: 'America/Santiago', label: 'Santiago' },
  { id: 'America/Sao_Paulo', label: 'São Paulo' },
] as const

// The same shape create_club checks (and the subdomain, lib/club/host.ts).
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// "Pádel Norte" → "padel-norte": the subdomain proposed while typing the name.
export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export type NewClub = { name: string; slug: string; timezone: string; adminEmail: string }

function readField(form: FormData, field: string): string {
  const value = form.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

// The subdomain, lowercased; null without its shape. create_club and rename_club check that it is free.
function readSlug(form: FormData): string | null {
  const slug = readField(form, 'slug').toLowerCase()
  return slug.length >= 2 && slug.length <= 40 && SLUG.test(slug) ? slug : null
}

export function parseNewClubForm(form: FormData): ParseResult<NewClub> {
  const read = (field: string) => readField(form, field)
  const name = read('name')
  if (!name || name.length > 60) return { ok: false, message: 'Poné el nombre del club.' }
  const slug = readSlug(form)
  if (!slug) return { ok: false, message: errorMessage('invalid_slug') }
  const timezone = read('timezone')
  if (!TIMEZONES.some((zone) => zone.id === timezone)) return { ok: false, message: errorMessage('invalid_timezone') }
  const adminEmail = read('adminEmail').toLowerCase()
  if (adminEmail.length > 254 || !EMAIL.test(adminEmail)) return { ok: false, message: errorMessage('invalid_email') }
  return { ok: true, value: { name, slug, timezone, adminEmail } }
}

// /plataforma → "Cambiar dirección": the club and its new subdomain.
export function parseRenameClubForm(form: FormData): ParseResult<{ clubId: string; slug: string }> {
  const clubId = readUuid(form, 'clubId')
  if (!clubId) return { ok: false, message: errorMessage('invalid_input') }
  const slug = readSlug(form)
  if (!slug) return { ok: false, message: errorMessage('invalid_slug') }
  return { ok: true, value: { clubId, slug } }
}

export type PlatformClub = {
  id: string
  slug: string
  name: string
  createdAt: Date
  setupCompletedAt: Date | null
  activeCourts: number
  staff: number
  // The open invitation of its first admin, if any.
  adminInvitationExpiresAt: Date | null
  bookingsLastWeek: number
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// One line per club on /plataforma: where it stands, and its numbers.
export function clubSummary(club: PlatformClub, now: Date): { state: string; details: string } {
  const state = club.setupCompletedAt
    ? 'Listo'
    : club.staff === 0 && club.adminInvitationExpiresAt
      ? club.adminInvitationExpiresAt > now
        ? 'Invitación pendiente'
        : 'Invitación vencida'
      : 'Configurando'
  const details = [
    club.activeCourts === 0 ? 'Sin canchas' : count(club.activeCourts, 'cancha', 'canchas'),
    club.staff === 0 ? 'sin staff' : `${club.staff} staff`,
    `${count(club.bookingsLastWeek, 'reserva', 'reservas')} en 7 días`,
  ].join(' · ')
  return { state, details }
}
