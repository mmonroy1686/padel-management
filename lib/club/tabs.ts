import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

// Every section of the club panel, in order: the tabs on top from a tablet up.
export function clubTabs(role: Role): TabItem[] {
  const tabs: TabItem[] = [
    { href: '/club/inicio', label: 'Inicio', icon: 'home' },
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
    { href: '/club/asistente', label: 'Asistente', icon: 'racket' },
    { href: '/club/calendario', label: 'Calendario', icon: 'calendar' },
    { href: '/club/torneos', label: 'Torneos', icon: 'trophy' },
    { href: '/club/day-use', label: 'Day use', icon: 'ticket' },
    { href: '/club/cobros', label: 'Cobros', icon: 'cash' },
    { href: '/club/jugadores', label: 'Jugadores', icon: 'users' },
  ]
  return role === 'admin' ? [...tabs, { href: '/club/ajustes', label: 'Ajustes', icon: 'sliders' }] : tabs
}

// On a phone: four sections in the bottom bar, the rest behind «Más». What reception does all day (Inicio, Grilla,
// Cobros) is always there; the fourth is Ajustes for the admin (Miguel's call on 25/11) and Day use for reception,
// who sells passes at the desk (third critique, Miguel's call on 26/11; Jugadores moved to «Más»).
export function clubBarTabs(role: Role): TabItem[] {
  const all = clubTabs(role)
  const fourth = role === 'admin' ? '/club/ajustes' : '/club/day-use'
  return ['/club/inicio', '/club/grilla', '/club/cobros', fourth].map((href) => all.find((tab) => tab.href === href)!)
}

export type MoreItem = TabItem & { description: string }

const DESCRIPTIONS: Record<string, string> = {
  '/club/asistente': 'Huecos libres y flyer para WhatsApp.',
  '/club/calendario': 'El mes y la semana, con los turnos fijos.',
  '/club/torneos': 'Torneos y campeonatos del club.',
  '/club/day-use': 'Vender y controlar pases del día.',
  '/club/jugadores': 'Categorías, roles y datos de los jugadores.',
}

// What «Más» opens: the sections that are not in the bar, each with a line on what it is for.
export function clubMoreTabs(role: Role): MoreItem[] {
  const bar = new Set(clubBarTabs(role).map((tab) => tab.href))
  return clubTabs(role)
    .filter((tab) => !bar.has(tab.href))
    .map((tab) => ({ ...tab, description: DESCRIPTIONS[tab.href] ?? '' }))
}
