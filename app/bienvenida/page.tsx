import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { Card } from '@/components/ui/card'
import { saveProfile } from '@/lib/actions/profile'
import { safeNextPath } from '@/lib/auth/redirect'
import { requireViewer } from '@/lib/auth/viewer'
import { isProfileComplete } from '@/lib/domain/profile'

export const metadata: Metadata = { title: 'Bienvenida' }

type SearchParams = Promise<{ next?: string }>

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  const nextPath = safeNextPath(next)
  const viewer = await requireViewer(`/bienvenida?next=${encodeURIComponent(nextPath)}`)
  if (isProfileComplete(viewer.profile, viewer.membership)) redirect(nextPath)

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <Logo className="size-14" />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Bienvenida</h1>
        <p className="text-fg-muted">Contanos cómo jugás. Lo usamos para armar partidos parejos.</p>
      </div>
      <Card>
        <PlayerProfileForm
          mode="onboarding"
          action={saveProfile}
          next={nextPath}
          initial={{
            displayName: viewer.profile.display_name,
            side: viewer.profile.side,
            hand: viewer.profile.hand,
            gender: viewer.profile.gender,
            category: viewer.membership?.category ?? null,
            isPublic: viewer.profile.is_public,
          }}
        />
      </Card>
    </main>
  )
}
