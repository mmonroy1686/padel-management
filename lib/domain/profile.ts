export const SIDES = ['drive', 'backhand', 'both'] as const
export const HANDS = ['right', 'left'] as const
export const ROLES = ['admin', 'reception', 'player'] as const
export const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8] as const

export type Side = (typeof SIDES)[number]
export type Hand = (typeof HANDS)[number]
export type Role = (typeof ROLES)[number]

export const SIDE_LABELS: Record<Side, string> = { drive: 'Drive', backhand: 'Revés', both: 'Ambos lados' }
export const HAND_LABELS: Record<Hand, string> = { right: 'Diestro', left: 'Zurdo' }
export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', reception: 'Recepción', player: 'Jugador' }

// Before booking, a player needs side, hand and a category in the club (design: "alta obligatoria").
export function isProfileComplete(
  profile: { side: string | null; hand: string | null },
  membership: { category: number | null } | null,
): boolean {
  return Boolean(profile.side && profile.hand && membership?.category)
}

export function isStaffRole(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'reception'
}

export function categoryLabel(category: number | null, validated: boolean): string {
  if (category === null) return 'Sin categoría'
  return `${category}ª categoría, ${validated ? 'validada' : 'pendiente de validación'}`
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? ''
}
