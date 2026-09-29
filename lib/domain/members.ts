import type { Role } from './profile'

// A club member reception can load a booking for.
export type MemberOption = { userId: string; name: string }

export type MemberView = { userId: string; name: string; role: Role; category: number | null; validated: boolean }

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Categories waiting for validation first; then by name.
export function filterMembers(members: MemberView[], query: string): MemberView[] {
  const needle = normalizeText(query)
  return members
    .filter((member) => normalizeText(member.name).includes(needle))
    .sort((a, b) => Number(a.validated) - Number(b.validated) || a.name.localeCompare(b.name, 'es'))
}
