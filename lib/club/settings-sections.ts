import type { IconName } from '@/components/ui/icon'

// platformOnly: a tool for whoever runs the platform (the developer), not for the club's admin.
export type SettingsSection = { href: string; label: string; icon: IconName; description: string; platformOnly?: true }

// Ajustes, one screen per group so an admin finds a setting without scrolling through all of them. The order goes from
// who the club is to how it runs and what it charges.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: '/club/ajustes/club', label: 'Club', icon: 'palette', description: 'Nombre, logo y colores.' },
  {
    href: '/club/ajustes/datos',
    label: 'Datos del club',
    icon: 'pin',
    description: 'Ubicación, contacto, servicios y fotos que ven los jugadores en Inicio.',
  },
  {
    href: '/club/ajustes/reservas',
    label: 'Reservas y partidos',
    icon: 'calendar',
    description: 'Horario, turnos, cancelaciones y partidos abiertos.',
  },
  { href: '/club/ajustes/canchas', label: 'Canchas y precios', icon: 'grid', description: 'Las canchas y cuánto sale cada franja.' },
  { href: '/club/ajustes/pagos', label: 'Pagos', icon: 'cash', description: 'Efectivo, POS, transferencia y sus datos.' },
  { href: '/club/ajustes/sellos', label: 'Sellos', icon: 'ticket', description: 'La recompensa por venir al day use.' },
  { href: '/club/ajustes/flyer', label: 'Flyer', icon: 'image', description: 'WhatsApp y fondo del flyer de turnos libres.' },
  { href: '/club/ajustes/staff', label: 'Staff', icon: 'users', description: 'Quién maneja el club: invitar, roles y accesos.' },
  {
    href: '/club/ajustes/monitoreo',
    label: 'Monitoreo',
    icon: 'alert',
    description: 'Probar que los errores llegan a Sentry.',
    platformOnly: true,
  },
]

// The sections a viewer sees: Monitoreo only for a platform admin.
export function visibleSections(platformAdmin: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => platformAdmin || !section.platformOnly)
}

// The section of a path (none on /club/ajustes itself: the index).
export function currentSection(pathname: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
}

export function sectionOf(href: string): SettingsSection {
  const section = SETTINGS_SECTIONS.find((candidate) => candidate.href === href)
  if (!section) throw new Error(`Unknown settings section ${href}`)
  return section
}
