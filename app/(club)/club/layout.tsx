import Link from 'next/link'
import { ClubLogo } from '@/components/brand/club-logo'
import { TabNav } from '@/components/nav/tab-nav'
import { requireStaff } from '@/lib/auth/viewer'
import { clubTabs } from '@/lib/club/tabs'

// Reception and admin only. Each page checks it again (layouts do not re-run on every navigation).
export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff('/club/grilla')

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-4 pt-6">
        <div className="flex items-center gap-3">
          <ClubLogo club={viewer.club} className="size-12" />
          <div>
            <h1 className="font-display text-3xl font-bold uppercase">Panel del club</h1>
            <p className="text-fg-muted">{viewer.club.name}</p>
          </div>
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
          Ir a la app
        </Link>
      </header>
      <TabNav label="Panel" items={clubTabs(viewer.membership.role)} variant="top" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  )
}
