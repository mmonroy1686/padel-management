import type { Metadata } from 'next'
import { AvailabilityForm } from '@/components/profile/availability-form'
import { AvatarForm } from '@/components/profile/avatar-form'
import { ContactForm } from '@/components/profile/contact-form'
import { PlayerProfileForm } from '@/components/profile/player-profile-form'
import { PreferredCourtsForm } from '@/components/profile/preferred-courts-form'
import { SubmitButton } from '@/components/ui/submit-button'
import { AutoSaveForm } from '@/components/ui/auto-save-form'
import { PageSection } from '@/components/ui/page-section'
import { PodiumShowcase } from '@/components/history/podium-showcase'
import { RowLink, RowList } from '@/components/ui/row-list'
import { loadMyPodiums, loadPlayedBookings } from '@/lib/data/history'
import { historyStats } from '@/lib/domain/booking-result'
import { removeAvatar, saveAvailability, saveAvatar, saveContact, savePreferredCourts, saveProfile, setShowInClub, signOut } from '@/lib/actions/profile'
import { requirePlayer } from '@/lib/auth/viewer'
import { availabilityKey } from '@/lib/domain/availability'
import { categoryLabel } from '@/lib/domain/profile'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Perfil' }

export default async function ProfilePage() {
  const viewer = await requirePlayer('/perfil')
  const { profile, membership } = viewer
  const supabase = await createClient()
  const [availability, preferred, courts, contact, podiums, played] = await Promise.all([
    supabase.from('player_availability').select('weekday, band').eq('user_id', viewer.userId),
    supabase.from('player_preferred_courts').select('court_id').eq('user_id', viewer.userId),
    supabase.from('courts').select('id, name').eq('club_id', viewer.club.id).eq('is_active', true).order('sort_order'),
    supabase.from('player_contacts').select('phone, whatsapp_consent').eq('user_id', viewer.userId).maybeSingle(),
    loadMyPodiums(viewer.club, viewer.userId),
    loadPlayedBookings(viewer.club, 50),
  ])
  const stats = historyStats(played)
  if (availability.error) throw availability.error
  if (preferred.error) throw preferred.error
  if (courts.error) throw courts.error
  if (contact.error) throw contact.error

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold uppercase">{profile.display_name}</h1>
        <p className="text-fg-muted">{categoryLabel(membership.category, membership.category_validated)}</p>
        {viewer.email ? <p className="text-sm text-fg-muted">Ingresás con {viewer.email}</p> : null}
      </div>
      {/* What the player did in the club first: their podiums and their matches. Only they see it. */}
      <PageSection id="tus-podios" title="Tus podios">
        <PodiumShowcase podiums={podiums} />
      </PageSection>
      <RowList label="Tu historial">
        <RowLink
          href="/perfil/partidos"
          icon="racket"
          title={`Partidos jugados: ${stats.played}`}
          detail={stats.withResult > 0 ? `Ganaste ${stats.won} de ${stats.withResult} con resultado` : 'Anotá tus resultados'}
        />
      </RowList>
      <AvatarForm userId={viewer.userId} name={profile.display_name} profile={profile} saveAction={saveAvatar} removeAction={removeAvatar} />
      <p className="text-sm text-fg-muted">Los cambios se guardan solos.</p>
      <PageSection id="tus-datos" title="Tus datos">
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
      </PageSection>
      <PageSection id="tu-whatsapp" title="WhatsApp">
        <ContactForm
          action={saveContact}
          contact={contact.data ? { phone: contact.data.phone, whatsappConsent: contact.data.whatsapp_consent } : null}
        />
      </PageSection>
      {/* Optional, and long (21 boxes): closed until the player wants it. */}
      <details className="group flex flex-col gap-3 border-t border-border pt-4">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-lg font-semibold">
          Preferencias de juego (opcional)
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3 flex flex-col gap-8">
          <PageSection id="cuando-jugas" title="Cuándo solés poder jugar">
            <p className="text-sm text-fg-muted">Lo usamos para mostrarte partidos y sugerirte a otros. Nadie más lo ve.</p>
            <AvailabilityForm action={saveAvailability} selected={availability.data.map((row) => availabilityKey(row.weekday, row.band))} />
          </PageSection>
          <PageSection id="canchas-preferidas" title="Canchas preferidas">
            <PreferredCourtsForm action={savePreferredCourts} courts={courts.data} selected={preferred.data.map((row) => row.court_id)} />
          </PageSection>
        </div>
      </details>
      <PageSection id="en-el-club" title="Ya están en el club">
        <AutoSaveForm action={setShowInClub} label="«Ya están en el club»">
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="showInClub" defaultChecked={profile.show_in_club} className="size-5 accent-accent" />
            Aparecer en «Ya están en el club»
          </label>
          <p className="text-sm text-fg-muted">
            Cuando registrás tu ingreso de day use, los otros jugadores ven tu nombre en la lista del día.
          </p>
        </AutoSaveForm>
      </PageSection>
      <form action={signOut} className="border-t border-border pt-4">
        <SubmitButton label="Cerrar sesión" pendingLabel="Saliendo…" variant="secondary" />
      </form>
    </>
  )
}
