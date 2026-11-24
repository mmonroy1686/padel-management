export const SIDES = ['drive', 'backhand', 'both'] as const
export const HANDS = ['right', 'left'] as const
export const ROLES = ['admin', 'reception', 'player'] as const
export const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8] as const
export const GENDERS = ['male', 'female'] as const
export type Gender = (typeof GENDERS)[number]
export const GENDER_LABELS: Record<Gender, string> = { male: 'Masculino', female: 'Femenino' }

export type Side = (typeof SIDES)[number]
export type Hand = (typeof HANDS)[number]
export type Role = (typeof ROLES)[number]

export const SIDE_LABELS: Record<Side, string> = { drive: 'Drive', backhand: 'Revés', both: 'Ambos lados' }
export const HAND_LABELS: Record<Hand, string> = { right: 'Diestro', left: 'Zurdo' }
export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', reception: 'Recepción', player: 'Jugador' }

// Before booking or joining a match, a player needs side, hand, gender and a category in the club
// (design: "alta obligatoria"; fase 2 adds gender, so older accounts see the welcome form again).
export function isProfileComplete(
  profile: { side: string | null; hand: string | null; gender: string | null },
  membership: { category: number | null } | null,
): boolean {
  return Boolean(profile.side && profile.hand && profile.gender && membership?.category)
}

export function isStaffRole(role: string | null | undefined): role is Exclude<Role, 'player'> {
  return role === 'admin' || role === 'reception'
}

// Inicio without a complete player profile: staff go to the panel (they need no player profile), the rest to the
// welcome. Staff who open a player screen still get the welcome there (requirePlayer).
export function incompleteHome(membership: { role: Role } | null): '/club' | '/bienvenida' {
  return isStaffRole(membership?.role) ? '/club' : '/bienvenida'
}

export function categoryLabel(category: number | null, validated: boolean): string {
  if (category === null) return 'Sin categoría'
  return `${category}ª categoría, ${validated ? 'validada' : 'pendiente de validación'}`
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? ''
}
