import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

export function clubTabs(role: Role): TabItem[] {
  const tabs: TabItem[] = [
    { href: '/club/grilla', label: 'Grilla' },
    { href: '/club/calendario', label: 'Calendario' },
    { href: '/club/cobros', label: 'Cobros' },
    { href: '/club/jugadores', label: 'Jugadores' },
  ]
  return role === 'admin' ? [...tabs, { href: '/club/ajustes', label: 'Ajustes' }] : tabs
}
