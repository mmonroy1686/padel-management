import { ClubHeader } from '@/components/brand/club-header'
import { TabNav, type TabItem } from '@/components/nav/tab-nav'
import { getClub, getViewer } from '@/lib/auth/viewer'

const PLAYER_TABS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservar', label: 'Reservar', icon: 'calendar-plus' },
  { href: '/partidos', label: 'Partidos', icon: 'racket' },
  { href: '/torneos', label: 'Torneos', icon: 'trophy' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
]

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const [viewer, club] = await Promise.all([getViewer(), getClub()])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <ClubHeader club={club} />
      <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-5">{children}</main>
      {viewer ? <TabNav label="Secciones" items={PLAYER_TABS} variant="bottom" /> : null}
    </div>
  )
}
