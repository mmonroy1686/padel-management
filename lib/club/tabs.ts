import type { TabItem } from '@/components/nav/tab-nav'
import type { Role } from '@/lib/domain/profile'

// Club screens. Each one is added here in the slice that builds it, so the tabs never lead to a 404.
export function clubTabs(role: Role): TabItem[] {
  void role
  return [
    { href: '/club/grilla', label: 'Grilla' },
    { href: '/club/cobros', label: 'Cobros' },
  ]
}
