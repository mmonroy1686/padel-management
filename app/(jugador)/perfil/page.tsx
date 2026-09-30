import type { Metadata } from 'next'
import { AvailabilityForm } from '@/components/profile/availability-form'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { PreferredCourtsForm } from '@/components/profile/preferred-courts-form'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import { saveAvailability, savePreferredCourts, saveProfile, signOut } from '@/lib/actions/profile'
import { requirePlayer } from '@/lib/auth/viewer'
import { availabilityKey } from '@/lib/domain/availability'
import { categoryLabel } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Perfil' }

export default async function ProfilePage() {
  const viewer = await requirePlayer('/perfil')
  const { profile, membership } = viewer
  const supabase = await createClient()
  const [availability, preferred, courts] = await Promise.all([
    supabase.from('player_availability').select('weekday, band').eq('user_id', viewer.userId),
    supabase.from('player_preferred_courts').select('court_id').eq('user_id', viewer.userId),
    supabase.from('courts').select('id, name').eq('club_id', viewer.club.id).eq('is_active', true).order('sort_order'),
  ])
  if (availability.error) throw availability.error
  if (preferred.error) throw preferred.error
  if (courts.error) throw courts.error

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
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Cuándo solés poder jugar</h2>
        <p className="text-sm text-fg-muted">Lo usamos para mostrarte partidos y sugerirte a otros. Nadie más lo ve.</p>
        <AvailabilityForm
          action={saveAvailability}
          selected={availability.data.map((row) => availabilityKey(row.weekday, row.band))}
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Canchas preferidas</h2>
        <PreferredCourtsForm
          action={savePreferredCourts}
          courts={courts.data}
          selected={preferred.data.map((row) => row.court_id)}
        />
      </Card>
      <form action={signOut}>
        <SubmitButton label="Cerrar sesión" pendingLabel="Saliendo…" variant="secondary" />
      </form>
    </>
  )
}
