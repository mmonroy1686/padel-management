import type { ReactNode } from 'react'
import { ClubHeader } from '@/components/brand/club-header'
import { LegalLinks } from '@/components/legal/legal-links'
import { LiveNotifications } from '@/components/live/live-notifications'
import { AccountMenu } from '@/components/nav/account-menu'
import { TabNav, type TabItem } from '@/components/nav/tab-nav'
import { NotificationBell } from '@/components/waitlist/notification-bell'
import type { Club, Viewer } from '@/lib/auth/viewer'
import { countUnreadNotifications } from '@/lib/data/waitlist'
import { isStaffRole } from '@/lib/domain/profile'

const PLAYER_TABS: TabItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/reservar', label: 'Reservar', icon: 'calendar-plus' },
  { href: '/partidos', label: 'Partidos', icon: 'racket' },
  { href: '/torneos', label: 'Torneos', icon: 'trophy', also: ['/campeonatos', '/c'] },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
]

// The player's app around a screen: the club on top with "Volver", the bell and the account; the sections at the
// bottom. Without a session only the club shows. The player app uses it, and so does a championship's public page
// when a signed-in player lands there from the app, so it never becomes a dead end.
export async function PlayerShell({ club, viewer, children }: { club: Club; viewer: Viewer | null; children: ReactNode }) {
  const unread = viewer ? await countUnreadNotifications(viewer.userId, club.id) : 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl lg:max-w-5xl">
      <ClubHeader club={club}>
        {viewer ? (
          <div className="flex items-center gap-1">
            <NotificationBell unread={unread} />
            <AccountMenu
              name={viewer.profile.display_name}
              profile={viewer.profile}
              links={[
                { href: '/perfil', label: 'Tu perfil' },
                ...(isStaffRole(viewer.membership?.role) ? [{ href: '/club/inicio', label: 'Panel del club' }] : []),
              ]}
            />
          </div>
        ) : null}
      </ClubHeader>
      {viewer ? <LiveNotifications userId={viewer.userId} /> : null}
      <main className="flex flex-1 flex-col gap-6 px-4 pt-5 md:px-6">{children}</main>
      {/* Above the bottom tabs, which cover the last 7rem. */}
      <LegalLinks footer className="px-4 pb-28 pt-8" />
      {viewer ? <TabNav label="Secciones" items={PLAYER_TABS} variant="bottom" /> : null}
    </div>
  )
}
