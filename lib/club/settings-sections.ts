import type { IconName } from '@/components/ui/icon'

export type SettingsSection = { href: string; label: string; icon: IconName; description: string }

// Ajustes, one screen per group so an admin finds a setting without scrolling through all of them. The order goes from
// who the club is to how it runs and what it charges.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: '/club/ajustes', label: 'Club', icon: 'palette', description: 'Nombre, logo y colores.' },
  {
    href: '/club/ajustes/reservas',
    label: 'Reservas y partidos',
    icon: 'calendar',
    description: 'Horario, turnos, cancelaciones y partidos abiertos.',
  },
  { href: '/club/ajustes/canchas', label: 'Canchas y precios', icon: 'grid', description: 'Las canchas y cuánto sale cada franja.' },
  { href: '/club/ajustes/pagos', label: 'Pagos', icon: 'cash', description: 'Efectivo, transferencia y sus datos.' },
  { href: '/club/ajustes/sellos', label: 'Sellos', icon: 'ticket', description: 'La recompensa por venir al day use.' },
  { href: '/club/ajustes/flyer', label: 'Flyer', icon: 'image', description: 'WhatsApp y fondo del flyer de turnos libres.' },
  { href: '/club/ajustes/staff', label: 'Staff', icon: 'users', description: 'Quién maneja el club: invitar, roles y accesos.' },
  { href: '/club/ajustes/monitoreo', label: 'Monitoreo', icon: 'alert', description: 'Probar que los errores llegan a Sentry.' },
]

// The section of a path: exact for the first one (/club/ajustes), so it does not light up on every other section.
export function currentSection(pathname: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) =>
    section.href === '/club/ajustes' ? pathname === section.href : pathname === section.href || pathname.startsWith(`${section.href}/`),
  )
}

export function sectionOf(href: string): SettingsSection {
  const section = SETTINGS_SECTIONS.find((candidate) => candidate.href === href)
  if (!section) throw new Error(`Unknown settings section ${href}`)
  return section
}
