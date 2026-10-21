import type { Role } from './profile'

// A club member reception can load a booking for.
export type MemberOption = { userId: string; name: string }

export type MemberView = { userId: string; name: string; role: Role; category: number | null; validated: boolean }

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Members whose name has every typed word (accents and case do not matter), at most `max`.
export function searchMembers(members: MemberOption[], query: string, max: number): MemberOption[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  return members
    .filter((member) => {
      const text = normalizeText(member.name)
      return words.every((word) => text.includes(word))
    })
    .slice(0, max)
}
