import type { Metadata } from 'next'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { saveProfile, signOut } from '@/lib/actions/profile'
import { requirePlayer } from '@/lib/auth/viewer'
import { categoryLabel } from '@/lib/domain/profile'

export const metadata: Metadata = { title: 'Perfil' }

export default async function ProfilePage() {
  const viewer = await requirePlayer('/perfil')
  const { profile, membership } = viewer

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">{profile.display_name}</h1>
        <p className="text-fg-muted">{categoryLabel(membership.category, membership.category_validated)}</p>
      </div>
      <Card>
        <PlayerProfileForm
          mode="profile"
          action={saveProfile}
          initial={{
            displayName: profile.display_name,
            side: profile.side,
            hand: profile.hand,
            gender: profile.gender,
            category: membership.category,
            isPublic: profile.is_public,
          }}
        />
      </Card>
      <form action={signOut}>
        <Button type="submit" variant="secondary" fullWidth>
          Cerrar sesión
        </Button>
      </form>
    </>
  )
}
