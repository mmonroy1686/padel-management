// Emails and phone numbers out of what goes to Sentry: an error message from the database can carry a value the player
// typed. Every string in the event is rewritten; the shape stays.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// Uruguayan mobiles (099 123 456, 099123456, +598 99 123 456) and any number written with a leading +. Dates, times and
// ids don't match: they never start with + or 09.
const PHONE = /(?:\+\d[\d\s-]{6,14}\d)|(?:\b0?9\d[\s-]?\d{3}[\s-]?\d{3}\b)/g

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[teléfono]')
}

export function scrub<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as T
  if (Array.isArray(value)) return value.map((item) => scrub(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)])) as T
  }
  return value
}
