import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { NewClubForm } from '@/components/platform/new-club-form'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requestOrigin } from '@/lib/auth/request-origin'
import { getViewer } from '@/lib/auth/viewer'
import { clubUrl } from '@/lib/club/host'
import { isPlatformAdmin, loadPlatformClubs } from '@/lib/data/platform'
import { clubSummary, isPlatformHost } from '@/lib/domain/platform'
import { createClub, resendAdminInvitation } from './actions'

export const metadata: Metadata = { title: 'Plataforma', robots: { index: false } }

// What follows a slug in a club's address, from where a club "x" lives: ".localhost:3000", ".tudominio.uy". Null while
// clubs have no subdomains (the site URL for all).
function clubDomain(origin: string): string | null {
  const sample = new URL(clubUrl('x', process.env, origin)).host
  return sample.startsWith('x.') ? sample.slice(1) : null
}

// The platform: only on PLATFORM_HOST and for platform admins; anything else is a 404, so it never shows it exists.
export default async function PlatformPage() {
  if (!isPlatformHost((await headers()).get('host'))) notFound()
  const viewer = await getViewer()
  if (!viewer) redirect(`/auth/ingreso?next=${encodeURIComponent('/plataforma')}`)
  if (!(await isPlatformAdmin())) notFound()

  const [clubs, origin] = await Promise.all([loadPlatformClubs(), requestOrigin()])
  const now = new Date()

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">Plataforma</h1>

      <section aria-labelledby="nuevo-club" className="flex flex-col gap-3">
        <h2 id="nuevo-club" className="text-xl font-bold">
          Nuevo club
        </h2>
        <Card>
          <NewClubForm action={createClub} domain={clubDomain(origin)} />
        </Card>
      </section>

      <section aria-labelledby="clubes" className="flex flex-col gap-3">
        <h2 id="clubes" className="text-xl font-bold">
          Clubes
        </h2>
        <ul className="flex flex-col gap-3" aria-label="Clubes">
          {clubs.map((club) => {
            const summary = clubSummary(club, now)
            const url = clubUrl(club.slug, process.env, origin)
            return (
              <li key={club.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{club.name}</h3>
                    <span className="rounded-full border border-border px-3 py-1 text-sm">{summary.state}</span>
                  </div>
                  <p className="text-sm text-fg-muted">{summary.details}</p>
                  <a href={url} className="break-all text-sm underline underline-offset-4">
                    {url}
                  </a>
                  {club.adminInvitationExpiresAt && club.staff === 0 ? (
                    <ActionForm action={resendAdminInvitation} submitLabel="Reenviar invitación" pendingLabel="Reenviando…"
                      variant="secondary" size="sm" accessibleLabel={`Reenviar la invitación del admin de ${club.name}`}>
                      <input type="hidden" name="clubId" value={club.id} />
                    </ActionForm>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
