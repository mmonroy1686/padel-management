import type { Role } from './profile'

// A club member reception can load a booking for.
export type MemberOption = { userId: string; name: string }

export type MemberView = { userId: string; name: string; role: Role; category: number | null; validated: boolean }

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
