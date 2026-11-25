import Link from 'next/link'
import { ClubLogo } from '@/components/brand/club-logo'
import { BackButton } from '@/components/nav/back-button'
import { ClubBottomNav } from '@/components/nav/club-bottom-nav'
import { SectionTitle } from '@/components/nav/section-title'
import { TabNav } from '@/components/nav/tab-nav'
import { requireStaff } from '@/lib/auth/viewer'
import { clubBarTabs, clubMoreTabs, clubTabs } from '@/lib/club/tabs'

// Reception and admin only. Each page checks it again (layouts do not re-run on every navigation).
// On a phone: the logo and the section in one line on top, and the sections at the bottom (ClubBottomNav). From a
// tablet up: the club's name, "Ir a la app" and every section as tabs on top.
export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff('/club/inicio')
  const role = viewer.membership.role
  const tabs = clubTabs(role)

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:items-end md:pt-6 2xl:max-w-7xl">
        <div className="flex items-center gap-3">
          <ClubLogo club={viewer.club} className="size-10 md:size-12" />
          <div>
            <p className="hidden text-sm text-fg-muted md:block">Panel del club · {viewer.club.name}</p>
            <SectionTitle items={tabs} fallback="Panel del club" />
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <BackButton />
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
            Ir a la app
          </Link>
        </div>
      </header>
      <div className="hidden md:block">
        <TabNav label="Panel" items={tabs} variant="top" />
      </div>
      {/* pb-28 on a phone: the bottom bar covers the last 7rem. */}
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-28 pt-6 md:pb-6 2xl:max-w-7xl">{children}</main>
      <ClubBottomNav bar={clubBarTabs(role)} more={clubMoreTabs(role)} />
    </div>
  )
}
