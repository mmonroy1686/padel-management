import { TabNav, type TabItem } from '@/components/nav/tab-nav'
import { getViewer } from '@/lib/auth/viewer'

const PLAYER_TABS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservar', label: 'Reservar', icon: 'calendar-plus' },
  { href: '/partidos', label: 'Partidos', icon: 'racket' },
  { href: '/reservas', label: 'Mis reservas', icon: 'ticket' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
]

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-6">{children}</main>
      {viewer ? <TabNav label="Secciones" items={PLAYER_TABS} variant="bottom" /> : null}
    </div>
  )
}
