import { ClubLogo } from '@/components/brand/club-logo'
import { PlayerShell } from '@/components/nav/player-shell'
import { getClub, getViewer } from '@/lib/auth/viewer'

// The public pages of a championship (/c/<code> and its TV mode). A signed-in player who comes from the app keeps the
// app around it (Volver, the account, the sections); anyone else with the link sees only the club's logo and name.
// The TV mode covers the whole screen on its own.
export default async function PublicChampionshipLayout({ children }: { children: React.ReactNode }) {
  const [viewer, club] = await Promise.all([getViewer(), getClub()])
  if (viewer) {
    return (
      <PlayerShell club={club} viewer={viewer}>
        {children}
      </PlayerShell>
    )
  }
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
