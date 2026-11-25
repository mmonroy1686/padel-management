import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { NewClubForm } from '@/components/platform/new-club-form'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { requestOrigin } from '@/lib/auth/request-origin'
import { getViewer } from '@/lib/auth/viewer'
import { clubDomainSuffix, clubUrl } from '@/lib/club/host'
import { isPlatformAdmin, loadPlatformClubs } from '@/lib/data/platform'
import { clubSummary, isPlatformHost } from '@/lib/domain/platform'
import { createClub, renameClub, resendAdminInvitation } from './actions'

export const metadata: Metadata = { title: 'Plataforma', robots: { index: false } }

// The platform: only on PLATFORM_HOST and for platform admins; anything else is a 404, so it never shows it exists.
export default async function PlatformPage() {
  if (!isPlatformHost((await headers()).get('host'))) notFound()
  const viewer = await getViewer()
  if (!viewer) redirect(`/auth/ingreso?next=${encodeURIComponent('/plataforma')}`)
  if (!(await isPlatformAdmin())) notFound()

  const [clubs, origin] = await Promise.all([loadPlatformClubs(), requestOrigin()])
  const now = new Date()
  const domain = clubDomainSuffix(process.env, origin)

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">Plataforma</h1>

      <section aria-labelledby="nuevo-club" className="flex flex-col gap-3">
        <h2 id="nuevo-club" className="text-xl font-bold">
          Nuevo club
        </h2>
        <Card>
          {domain ? (
            <NewClubForm action={createClub} domain={domain} />
          ) : (
            <p className="text-fg-muted">
              Para crear clubes hace falta el dominio: cada club vive en su subdominio. Cargá{' '}
              <code>NEXT_PUBLIC_ROOT_DOMAIN</code> en Vercel (README, «Un club por subdominio») y volvé a desplegar.
            </p>
          )}
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
                  {domain ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer py-2 underline underline-offset-4">Cambiar dirección</summary>
                      <ActionForm action={renameClub} submitLabel="Cambiar dirección" pendingLabel="Cambiando…"
                        variant="secondary" size="sm" accessibleLabel={`Cambiar la dirección de ${club.name}`}>
                        <input type="hidden" name="clubId" value={club.id} />
                        <Field label="Dirección nueva" htmlFor={`slug-${club.id}`}
                          hint={`Los links, invitaciones y apps instaladas con ${club.slug}${domain} dejan de andar.`}>
                          <input id={`slug-${club.id}`} name="slug" required maxLength={40} defaultValue={club.slug}
                            autoCapitalize="none" autoComplete="off" aria-describedby={`slug-${club.id}-hint`}
                            className={inputClasses} />
                        </Field>
                      </ActionForm>
                    </details>
                  ) : null}
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
