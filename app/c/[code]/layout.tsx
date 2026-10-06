import { ClubLogo } from '@/components/brand/club-logo'
import { getClub } from '@/lib/auth/viewer'

// The public pages of a championship (/c/<code> and its TV mode): anyone with the link, no session, no tabs.
// Only the club's logo and name on top.
export default async function PublicChampionshipLayout({ children }: { children: React.ReactNode }) {
  const club = await getClub()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl lg:max-w-5xl">
      <header className="border-b border-border">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <ClubLogo club={club} className="size-9" />
          <span className="font-display text-xl font-bold uppercase">{club.name}</span>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-4 pb-16 pt-5 md:px-6">{children}</main>
    </div>
  )
}
