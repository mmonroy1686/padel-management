import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

export function clubTabs(role: Role): TabItem[] {
  const tabs: TabItem[] = [
    { href: '/club/grilla', label: 'Grilla', icon: 'grid' },
    { href: '/club/calendario', label: 'Calendario', icon: 'calendar' },
    { href: '/club/torneos', label: 'Torneos', icon: 'trophy' },
    { href: '/club/cobros', label: 'Cobros', icon: 'cash' },
    { href: '/club/jugadores', label: 'Jugadores', icon: 'users' },
  ]
  return role === 'admin' ? [...tabs, { href: '/club/ajustes', label: 'Ajustes', icon: 'sliders' }] : tabs
}
