import { TabNav } from '@/components/nav/tab-nav'
import { getViewer } from '@/lib/auth/viewer'

const PLAYER_TABS = [
  { href: '/', label: 'Inicio' },
  { href: '/reservar', label: 'Reservar' },
  { href: '/reservas', label: 'Mis reservas' },
  { href: '/perfil', label: 'Perfil' },
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
