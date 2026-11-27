import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { WeekStats, WeeksTable } from '@/components/platform/club-weeks'
import { MilestoneList } from '@/components/platform/milestone-list'
import { TrialBadge } from '@/components/platform/trial-badge'
import { ActionForm } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { PageSection } from '@/components/ui/page-section'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubDomainSuffix, clubUrl } from '@/lib/club/host'
import { loadClubAccount, loadClubWeeks, loadPlatformClubs } from '@/lib/data/platform'
import { shortDate } from '@/lib/domain/format'
import { clubSummary } from '@/lib/domain/platform'
import { ACCOUNT_STATUSES, activation, milestoneGroups, trialState } from '@/lib/domain/platform-trial'
import { localDateOf } from '@/lib/domain/time'
import {
  joinAsSupport,
  leaveSupport,
  renameClub,
  resendAdminInvitation,
  saveAccountContact,
  setAccountStatus,
} from '../../actions'
import { requirePlatform } from '../../require-platform'

export const metadata: Metadata = { title: 'Club · Plataforma', robots: { index: false } }

// One club's trial: where it stands and what to do about it on top, the milestones and the weeks below, and the
// owner's contact and notes at the end.
export default async function PlatformClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requirePlatform(`/plataforma/clubes/${slug}`)
  const [clubs, origin] = await Promise.all([loadPlatformClubs(), requestOrigin()])
  const club = clubs.find((item) => item.slug === slug)
  if (!club) notFound()
  const [weeks, account] = await Promise.all([loadClubWeeks(club.id), loadClubAccount(club.id)])

  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const trial = trialState(club, today)
  const progress = activation(club)
  const setup = clubSummary(club, now)
  const url = clubUrl(club.slug, process.env, origin)
  const domain = clubDomainSuffix(process.env, origin)

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-4">
        <Link href="/plataforma" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-accent-ink">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          Clubes
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-bold uppercase">{club.name}</h1>
          <a href={url} className="w-fit break-all text-sm text-fg-muted underline underline-offset-4">
            {url}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <TrialBadge text={trial.text} tone={trial.tone} />
          <span className="text-sm text-fg-muted">
            {setup.state} · {setup.details} · alta el {shortDate(localDateOf(club.createdAt, club.timezone))}
          </span>
        </div>
      </header>

      <section aria-labelledby="estado" className="grid gap-6 rounded-xl border border-border p-4 md:p-6 lg:grid-cols-2">
        <h2 id="estado" className="sr-only">
          Estado y soporte
        </h2>
        <ActionForm action={setAccountStatus} submitLabel="Guardar estado" pendingLabel="Guardando…" variant="secondary" size="sm" className="items-start">
          <input type="hidden" name="clubId" value={club.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estado" htmlFor="status">
              <select id="status" name="status" defaultValue={club.status} className={inputClasses}>
                {ACCOUNT_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fin de la prueba" htmlFor="trialEndsOn" hint="Al vencer no pasa nada solo: el club sigue andando.">
              <input
                id="trialEndsOn"
                name="trialEndsOn"
                type="date"
                defaultValue={club.trialEndsOn}
                aria-describedby="trialEndsOn-hint"
                className={inputClasses}
              />
            </Field>
          </div>
        </ActionForm>

        <div className="flex flex-col gap-3 lg:border-l lg:border-border lg:pl-6">
          <p className="text-sm font-semibold">Soporte</p>
          {club.isSupport ? (
            <>
              <p className="text-sm text-fg-muted">Sos admin del club como soporte. El club te ve así en Staff.</p>
              <div className="flex flex-wrap items-start gap-2">
                <a href={`${url}/club/inicio`} className={buttonClasses({ size: 'sm' })}>
                  Abrir el panel del club
                </a>
                <ActionForm action={leaveSupport} submitLabel="Salir del club" pendingLabel="Saliendo…" variant="secondary" size="sm" className="items-start"
                  accessibleLabel={`Salir de ${club.name}`}>
                  <input type="hidden" name="clubId" value={club.id} />
                </ActionForm>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-fg-muted">
                Te suma como admin para ayudar desde adentro. Queda registrado y el club te ve como soporte.
              </p>
              <ActionForm action={joinAsSupport} submitLabel="Entrar como soporte" pendingLabel="Entrando…" variant="secondary" size="sm" className="items-start"
                accessibleLabel={`Entrar a ${club.name} como soporte`}>
                <input type="hidden" name="clubId" value={club.id} />
              </ActionForm>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <PageSection id="hitos" title={`Hitos · ${progress.done} de ${progress.total}`}>
          <MilestoneList groups={milestoneGroups(club)} timezone={club.timezone} nextKey={progress.next?.key ?? null} />
        </PageSection>
        <PageSection id="semana" title="La última semana">
          <WeekStats weeks={weeks} />
        </PageSection>
      </div>

      <PageSection id="semanas" title={`Las últimas ${weeks.length} semanas`}>
        <WeeksTable weeks={weeks} />
      </PageSection>

      <PageSection id="contacto" title="Contacto y notas">
        <ActionForm action={saveAccountContact} submitLabel="Guardar" pendingLabel="Guardando…" variant="secondary" size="sm" className="items-start">
          <input type="hidden" name="clubId" value={club.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Dueño o encargado" htmlFor="ownerName">
              <input id="ownerName" name="ownerName" maxLength={80} defaultValue={account.ownerName} autoComplete="off" className={inputClasses} />
            </Field>
            <Field label="Teléfono" htmlFor="ownerPhone">
              <input id="ownerPhone" name="ownerPhone" type="tel" maxLength={40} defaultValue={account.ownerPhone} autoComplete="off" className={inputClasses} />
            </Field>
            <Field label="Email" htmlFor="ownerEmail">
              <input id="ownerEmail" name="ownerEmail" type="email" maxLength={254} defaultValue={account.ownerEmail} autoComplete="off" className={inputClasses} />
            </Field>
          </div>
          <Field label="Notas" htmlFor="notes" hint="Solo las ves vos: lo que hablaron, lo que pidió, cuándo volver a llamar.">
            <textarea id="notes" name="notes" rows={5} maxLength={4000} defaultValue={account.notes} aria-describedby="notes-hint" className={inputClasses} />
          </Field>
        </ActionForm>
      </PageSection>

      <PageSection id="direccion" title="Dirección e invitación">
        <div className="flex flex-col gap-4">
          {domain ? (
            <ActionForm action={renameClub} submitLabel="Cambiar dirección" pendingLabel="Cambiando…" variant="secondary" size="sm" className="items-start"
              accessibleLabel={`Cambiar la dirección de ${club.name}`}>
              <input type="hidden" name="clubId" value={club.id} />
              <Field label="Dirección" htmlFor="slug"
                hint={`Los links, invitaciones y apps instaladas con ${club.slug}${domain} dejan de andar.`}>
                <input id="slug" name="slug" required maxLength={40} defaultValue={club.slug} autoCapitalize="none" autoComplete="off"
                  aria-describedby="slug-hint" className={inputClasses} />
              </Field>
            </ActionForm>
          ) : null}
          {club.adminInvitationExpiresAt && club.staff === 0 ? (
            <ActionForm action={resendAdminInvitation} submitLabel="Reenviar invitación del admin" pendingLabel="Reenviando…"
              variant="secondary" size="sm" className="items-start" accessibleLabel={`Reenviar la invitación del admin de ${club.name}`}>
              <input type="hidden" name="clubId" value={club.id} />
            </ActionForm>
          ) : club.staff > 0 ? (
            <p className="text-sm text-fg-muted">El admin del club ya entró.</p>
          ) : null}
        </div>
      </PageSection>
    </main>
  )
}
