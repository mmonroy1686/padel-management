import { PlayerShell } from '@/components/nav/player-shell'
import { getClub, getViewer } from '@/lib/auth/viewer'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const [viewer, club] = await Promise.all([getViewer(), getClub()])
  return (
    <PlayerShell club={club} viewer={viewer}>
      {children}
    </PlayerShell>
  )
}
