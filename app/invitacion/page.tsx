import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClubLogo } from '@/components/brand/club-logo'
import { LegalLinks } from '@/components/legal/legal-links'
import { ActionForm } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { acceptInvitation, signInWithAnotherEmail } from '@/lib/actions/invitation'
import { getClub, getViewer } from '@/lib/auth/viewer'
import { isStaffRole } from '@/lib/domain/profile'

export const metadata: Metadata = { title: 'Invitación' }

const SIGN_IN = `/auth/ingreso?next=${encodeURIComponent('/invitacion')}`

// The link of the staff invitation mail. Without a session it explains what to do and sends to sign in (back here
// after); with one, accepting takes a button, so a prefetch of the page never accepts anything.
export default async function InvitationPage() {
  const viewer = await getViewer()
  if (viewer && isStaffRole(viewer.membership?.role)) redirect('/club')
  const club = viewer?.club ?? (await getClub())

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <ClubLogo club={club} className="size-16" />
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Invitación</h1>
        {viewer ? (
          <p className="text-fg-muted">
            Entraste como <strong className="text-fg">{viewer.email}</strong>. Si {club.name} te invitó a su staff con
            este email, aceptá para entrar al panel del club.
          </p>
        ) : (
          <p className="text-fg-muted">
            {club.name} te invitó a su staff. Para aceptar, entrá con el email al que te llegó la invitación: te mandamos
            un enlace y volvés acá.
          </p>
        )}
      </div>
      {viewer ? (
        <>
          <Card>
            <ActionForm action={acceptInvitation} submitLabel="Aceptar invitación" pendingLabel="Aceptando…" />
            <p className="mt-3 text-sm text-fg-muted">
              Si la invitación venció o la cancelaron, pedile al club que te invite de nuevo.
            </p>
          </Card>
          <form action={signInWithAnotherEmail}>
            <button type="submit" className="min-h-11 text-sm underline underline-offset-4">
              ¿Te invitaron con otro email? Entrá con ese
            </button>
          </form>
        </>
      ) : (
        <Link href={SIGN_IN} className={buttonClasses({ fullWidth: true })}>
          Entrar para aceptar
        </Link>
      )}
      <LegalLinks />
    </main>
  )
}
