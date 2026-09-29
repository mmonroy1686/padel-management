import type { LocalDate } from './time'

// Server Actions are reachable by any POST: every field is read and checked here before it
// reaches an RPC. They return null for anything that does not have the expected shape.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZONED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function raw(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : null
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function readUuid(form: FormData, name: string): string | null {
  const value = raw(form, name)
  return isUuid(value) ? value.toLowerCase() : null
}

export function readInstant(form: FormData, name: string): string | null {
  const value = raw(form, name)
  if (!value || !ZONED_INSTANT.test(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

export function readInt(form: FormData, name: string, range: { min: number; max: number }): number | null {
  const value = raw(form, name)
  if (!value || !/^-?\d+$/.test(value)) return null
  const number = Number(value)
  return number >= range.min && number <= range.max ? number : null
}

export function readText(form: FormData, name: string, options: { maxLength: number }): string | null {
  const value = raw(form, name)
  return value && value.length <= options.maxLength ? value : null
}

export function readEnum<T extends string>(form: FormData, name: string, values: readonly T[]): T | null {
  const value = raw(form, name)
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null
}

export function readTime(form: FormData, name: string): string | null {
  const value = raw(form, name)
  return value && TIME.test(value) ? value : null
}

export function readBoolean(form: FormData, name: string): boolean {
  return form.get(name) === 'on'
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function readLocalDate(form: FormData, name: string): LocalDate | null {
  const value = raw(form, name)
  return isLocalDate(value) ? value : null
}
